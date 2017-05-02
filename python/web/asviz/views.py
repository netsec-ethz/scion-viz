# Copyright 2017 ETH Zurich
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

from django.template import loader
from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.http import HttpResponseRedirect, HttpResponse
from django.core.urlresolvers import reverse

import pprint
import json

# SCION
from endhost.sciond import SCIONDaemon
from lib.defines import GEN_PATH
from lib.packet.host_addr import haddr_parse
from lib.packet.scion_addr import ISD_AS, SCIONAddr
from lib.packet.opaque_field import (
    HopOpaqueField,
    InfoOpaqueField,
)
from lib.packet.host_addr import HostAddrIPv4

# defaults
s_isd_as = ISD_AS("1-18")
s_ip = haddr_parse(1, "127.1.18.1")
c_isd_as = ISD_AS("2-26")
c_ip = haddr_parse(1, "127.2.26.1")
sd = None

def get_as_view_html(sd, myaddr, dst_isd_as):
    s = []
    s.append("<ul class='tree'>")

    t = sd.topology
    p_as_topology(s, t)
        
    paths, error = sd.get_paths(dst_isd_as)
    i = 0
    pcolor = 'black'
    # enumerate all paths
    for path in paths:
        s.append("<li seg-type='PATH' seg-num=%s><a href='#' style='color:%s; font-weight:bold;'>PATH %s</a>" % (i, pcolor, i + 1))
        s.append("<ul>")
        
        s.append("<li><a href='#'>MTU: %s</a>" % path.p.mtu)
        p_path_interfaces(s, sd, path.p)
        i += 1
        s.append("</ul>")

    # enumerate core segments
    segs = sd.core_segments()
    segidx = 0
    for seg in segs:
        p_segment(s, seg, segidx, "CORE", 'purple')
        segidx += 1

    # enumerate down segments
    segs = sd.down_segments()
    segidx = 0
    for seg in segs:
        p_segment(s, seg, segidx, "DOWN", 'red')
        segidx += 1

    # enumerate up segments
    segs = sd.up_segments()
    segidx = 0
    for seg in segs:
        p_segment(s, seg, segidx, "UP", 'green')
        segidx += 1

    s.append("</ul>")

    out_str = ''
    for str in s:
        out_str += (str + '\n')
    
    return out_str

def p_as_topology(s, t):
    s.append("<li><a href='#'>AS TOPOLOGY: %s</a>" % t.isd_as)
    s.append("<ul>")
    s.append("<li><a href='#'>is_core_as: %s</a>" % t.is_core_as)
    s.append("<li><a href='#'>mtu: %s</a>" % t.mtu)
    for v in t.beacon_servers:
        p_server_element(s, v, "BEACON")
    for v in t.certificate_servers:
        p_server_element(s, v, "CERTIFICATE")
    for v in t.path_servers:
        p_server_element(s, v, "PATH")
    for v in t.sibra_servers:
        p_server_element(s, v, "SIBRA")    
    for v in t.parent_border_routers:
        p_router_element(s, v, "PARENT BORDER")
    for v in t.child_border_routers:
        p_router_element(s, v, "CHILD BORDER")
    for v in t.peer_border_routers:
        p_router_element(s, v, "PEER BORDER")
    for v in t.zookeepers:
        s.append("<li><a href='#'>ZOOKEEPER:</a>")
        s.append("<ul>")
        s.append("<li><a href='#'>%s</a>" % v)
        s.append("</ul>")
    s.append("</ul>")

def j_segments(segs):
    cores = []
    for seg in segs:
        core = []
        for asms in seg.p.asms:
            core.append({
                "ISD":ISD_AS(asms.isdas)._isd,
                "AS":ISD_AS(asms.isdas)._as,
                "IFID":0,
            })
        cores.append(core)
    path = {}
    path["if_lists"] = cores
    return path

def j_all_segments(sd):
    data = {}

    segs = sd.core_segments()
    data["core_segments"] = j_segments(segs)
    
    segs = sd.up_segments()
    data["up_segments"] = j_segments(segs)
    
    segs = sd.down_segments()
    data["down_segments"] = j_segments(segs)
        
    return data

def j_as_topology(sd):
    t = sd.topology
    nodes = []
    links = []
    isd_as = t.isd_as.__str__()
    nodes.append({ "name": isd_as, "type": "core" })

    for v in t.beacon_servers:
        nodes.append(j_server_node(v, "BEACON"))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.certificate_servers:
        nodes.append(j_server_node(v, "CERTIFICATE"))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.path_servers:
        nodes.append(j_server_node(v, "PATH"))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.sibra_servers:
        nodes.append(j_server_node(v, "SIBRA"))    
        links.append(j_internal_link(isd_as, v.name))
    for v in t.parent_border_routers:
        nodes.append(j_router_node(v, "PARENT BORDER"))
        nodes.append(j_interface_node(v))
        links.append(j_interface_link(v))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.child_border_routers:
        nodes.append(j_router_node(v, "CHILD BORDER"))
        nodes.append(j_interface_node(v))
        links.append(j_interface_link(v))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.peer_border_routers:
        nodes.append(j_router_node(v, "PEER BORDER"))
        nodes.append(j_interface_node(v))
        links.append(j_interface_link(v))
        links.append(j_internal_link(isd_as, v.name))
    for v in t.zookeepers:
        nodes.append(j_zookeeper_node(v))
        links.append(j_internal_link(isd_as, "zk"))

    graph = {}
    graph["nodes"] = nodes
    graph["links"] = links
    return graph

def j_internal_link(src, dst):
    return { 
        "source": src,
        "target": dst,
        "type": "as-in"
    }         

def j_zookeeper_node(v):
    return { 
        "name": "zk",
        "type": "server",
        "class": "ZOOKEEPER",
        "addr": v,
    }

def j_server_node(v, name):
    return { 
        "name": v.name,
        "type": "server",
        "class": name,
        "addr": HostAddrIPv4(v.addr).__str__(),
        "port": v.port
    }

def j_router_node(v, name):
    return { 
        "name": v.name,
        "type": "router",
        "class": name,
        "addr": HostAddrIPv4(v.addr).__str__(),
        "port": v.port,
        "if_addr": HostAddrIPv4(v.interface.addr).__str__(),
        "if_bandwidth": v.interface.bandwidth,
        "if_id": v.interface.if_id,
        "if_isd_as": v.interface.isd_as.__str__(),
        "if_link_type": v.interface.link_type,
        "if_mtu": v.interface.mtu,
        "if_name": v.interface.name,
        "if_port": v.interface.port,
        "if_udp_port": v.interface.udp_port,
        "if_to_addr": HostAddrIPv4(v.interface.to_addr).__str__(),
        "if_to_if_id": v.interface.to_if_id,
        "if_to_udp_port": v.interface.to_udp_port,
    }

def j_interface_link(v):
    return { 
        "source": v.name,
        "target": v.interface.isd_as.__str__(),
        "type": "as-" + v.interface.link_type.lower()
    }         

def j_interface_node(v):
    return { 
        "name": v.interface.isd_as.__str__(),
        "type": "interface",
        "class": "ISD-AS",
        "addr": HostAddrIPv4(v.interface.addr).__str__(),
        "port": v.interface.port
    }         

def j_path_interfaces(path):
    data = []
    last_i = None
    # enumerate path interfaces
    for interface in path.interfaces:       
        if last_i:

            isdas_p = ISD_AS(interface.isdas)
            link_p = interface.ifID
                
            isdas_n = ISD_AS(last_i.isdas)
            link_n = last_i.ifID

            p = ('%s-%s' % (isdas_p._isd, isdas_p._as))
            n = ('%s-%s' % (isdas_n._isd, isdas_n._as))
            data.append({"a":p, "b":n, "al":link_p, "bl":link_n, "ltype":"CHILD"})
            last_i = None
        
        last_i = interface

    return data

def p_path_interfaces(s, sd, path):
    s.append("<li><a href='#'>Interfaces Len: %s</a>" % len(path.interfaces))
    s.append("<ul>")
    # enumerate path interfaces
    for interface in path.interfaces:
        isd_as = ISD_AS(interface.isdas)
        link = interface.ifID
        try:
            addr = sd.ifid2br[link].addr
        except KeyError:
            addr = ''
        s.append("<li><a href='#'>%s-%s (%s) %s</a>" % (isd_as._isd, isd_as._as, link, addr))
    
    s.append("</ul>")

def p_server_element(s, v, name):
    s.append("<li><a href='#'>%s</a>" % v.name)
    s.append("<ul>")
    s.append("<li><a href='#'>%s SERVER</a>" % name)
    s.append("<li><a href='#'>Address: %s</a>" % HostAddrIPv4(v.addr))
    s.append("<li><a href='#'>Name: %s</a>" % v.name)
    s.append("<li><a href='#'>Port: %s</a>" % v.port)
    s.append("</ul>")

def p_router_element(s, v, name):
    s.append("<li><a href='#'>%s</a>" % v.name)
    s.append("<ul>")
    s.append("<li><a href='#'>%s ROUTER</a>" % name)
    s.append("<li><a href='#'>Address: %s</a>" % HostAddrIPv4(v.addr))
    s.append("<li><a href='#'>Name: %s</a>" % v.name)
    s.append("<li><a href='#'>Port: %s</a>" % v.port)
    p_interface_element(s, v.interface)
    s.append("</ul>")
        
def p_interface_element(s, i):
    s.append("<li><a href='#'>INTERFACE</a>")
    s.append("<ul>")
    s.append("<li><a href='#'>Address: %s</a>" % HostAddrIPv4(i.addr))
    s.append("<li><a href='#'>Bandwidth: %s</a>" % i.bandwidth)
    s.append("<li><a href='#'>Interface ID: %s</a>" % i.if_id)
    s.append("<li><a href='#'>ISD AS: %s</a>" % i.isd_as)
    s.append("<li><a href='#'>Link Type: %s</a>" % i.link_type)
    s.append("<li><a href='#'>MTU: %s</a>" % i.mtu)
    s.append("<li><a href='#'>Name: %s</a>" % i.name)
    s.append("<li><a href='#'>Port: %s</a>" % i.port)
    s.append("<li><a href='#'>UDP Port: %s</a>" % i.udp_port)
    s.append("<li><a href='#'>To Address: %s</a>" % HostAddrIPv4(i.to_addr))
    s.append("<li><a href='#'>To Interface ID: %s</a>" % i.to_if_id)
    s.append("<li><a href='#'>To UDP Port: %s</a>" % i.to_udp_port)
    s.append("</ul>")

def p_segment(s, seg, idx, name, color):
    s.append("<li seg-type='%s' seg-num=%s><a href='#' style='color:%s; font-weight:bold;'>%s SEGMENT %s</a>" % (name, idx, color, name, idx + 1))        
    s.append("<ul>")
    s.append("<li><a href='#'>Expiration Time: %s</a>" % seg._min_exp)
    p = seg.p
    # InfoOpaqueField
    s.append("<li><a href='#'>%s</a>" % InfoOpaqueField(p.info))
    # PathSegment
    s.append("<li><a href='#'>Interface ID: %s</a>" % p.ifID)
    s.append("<li><a href='#'>SIBRA Ext Up: %s</a>" % p.exts.sibra.up)
    asmsidx = 0
    for asms in p.asms:
        p_as_marking(s, asms, asmsidx)
        asmsidx += 1
    s.append("</ul>")

def p_as_marking(s, asms, asmsidx):
    # ASMarking
    s.append("<li><a href='#'>AS Marking Block %s</a>" % (asmsidx + 1))
    s.append("<ul>")
    s.append("<li><a href='#'>AS: %s</a>" % ISD_AS(asms.isdas))
    s.append("<li><a href='#'>TRC: v%s</a>" % asms.trcVer)
    s.append("<li><a href='#'>Cert: v%s</a>" % asms.certVer)
    s.append("<li><a href='#'>Interface ID Size: %s</a>" % asms.ifIDSize)
    s.append("<li><a href='#'>Hashtree Root: %s</a>" % asms.hashTreeRoot.hex())
    s.append("<li><a href='#'>Signature: %s</a>" % asms.sig.hex())
    s.append("<li><a href='#'>AS MTU: %s</a>" % asms.mtu)
    pcbmsidx = 0
    for pcbms in asms.pcbms:
        p_pcb_marking(s, pcbms, pcbmsidx)
        pcbmsidx += 1
    s.append("</ul>")

def p_pcb_marking(s, pcbms, pcbmsidx):
    # PCBMarking
    s.append("<li><a href='#'>PCB Marking Block %s</a>" % (pcbmsidx + 1))
    s.append("<ul>")
    s.append("<li><a href='#'>In: %s (%s)</a>" % (ISD_AS(pcbms.inIA), pcbms.inIF))
    s.append("<li><a href='#'>Out: %s (%s)</a>" % (ISD_AS(pcbms.outIA), pcbms.outIF))
    s.append("<li><a href='#'>%s</a>" % HopOpaqueField(pcbms.hof))
    s.append("</ul>")

def index(request):
    json_pathtopo = None
    json_segtopo = None
    json_astopo = None
    path_info = None
    src = dst = addr = ''
    if request.GET.get('src') and request.GET.get('dst'):
        src = request.GET.get('src')
        dst = request.GET.get('dst')
        s_isd_as = ISD_AS(src)
        c_isd_as = ISD_AS(dst)
        
        caddr = SCIONAddr.from_values(c_isd_as, c_ip)

        addr = haddr_parse("IPV4", "127.%s.%s.254" % (c_isd_as._isd, c_isd_as._as))
        conf_dir = "%s/ISD%s/AS%s/endhost" % (GEN_PATH, c_isd_as._isd, c_isd_as._as)
        sd = SCIONDaemon.start(conf_dir, addr)

        path_info = get_as_view_html(sd, caddr, s_isd_as)

        j_path = []
        paths, error = sd.get_paths(s_isd_as)
        for path in paths:
            j_path += j_path_interfaces(path.p)
            pprint.pprint(j_path)

        json_pathtopo = json.dumps(j_path)

        json_astopo = json.dumps(j_as_topology(sd))
        pprint.pprint(json_astopo)

        json_segtopo = json.dumps(j_all_segments(sd))
        pprint.pprint(json_segtopo)

    return render(request, 'asviz/index.html', {
        'json_pathtopo': json_pathtopo,
        'json_segtopo': json_segtopo,
        'json_astopo': json_astopo,
        'path_info': path_info,
        'src': src,
        'dst': dst,
    })
