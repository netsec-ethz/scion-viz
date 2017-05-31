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

import json

from endhost.sciond import SCIONDaemon
from lib.defines import GEN_PATH
from lib.packet.host_addr import HostAddrIPv4, haddr_parse
from lib.packet.opaque_field import HopOpaqueField, InfoOpaqueField
from lib.packet.scion_addr import ISD_AS

from django.shortcuts import render


# topology class definitions
topo_servers = ['BEACON', 'CERTIFICATE', 'PATH', 'SIBRA']
topo_br = ['CORE_BR', 'PARENT_BR', 'CHILD_BR', 'PEER_BR', 'BORDER']
topo_if = ['CORE_IF', 'PARENT_IF', 'CHILD_IF', 'PEER_IF']
topo_zk = ['ZOOKEEPER']

# defaults
s_isd_as = ISD_AS("1-18")
s_ip = haddr_parse(1, "127.1.18.1")
d_isd_as = ISD_AS("2-26")
d_ip = haddr_parse(1, "127.2.26.1")


def get_as_view_html(sd, paths, csegs, usegs, dsegs):
    s = []
    s.append("<ul class='tree'>")
    html_paths(sd, s, paths)
    html_all_segments(s, csegs, usegs, dsegs)
    indent_close(s)

    out_str = ''
    for str in s:
        out_str += (str + '\n')
    return out_str


def html_as_topology(s, t, topo):
    list_add(s, "AS TOPOLOGY: %s" % t.isd_as)
    indent_open(s)
    list_add(s, "is_core_as: %s" % t.is_core_as)
    list_add(s, "mtu: %s" % t.mtu)
    for servers in topo:
        idx = 1
        for v in topo[servers]:
            if servers in topo_servers:
                p_server_element(s, v, servers)
            elif servers in topo_br:
                p_router_element(s, v, servers)
            elif servers in topo_zk:
                p_zookeeper(s, v, idx)
            idx += 1
    indent_close(s)


def html_paths(sd, s, paths):
    i = 0
    # enumerate all paths
    for path in paths:
        list_add_head(s, i, "PATH", "black")
        indent_open(s)
        list_add(s, "MTU: %s" % path.p.mtu)
        list_add(s, "Interfaces Len: %s" % len(path.p.interfaces))
        # enumerate path interfaces
        for interface in path.p.interfaces:
            isd_as = ISD_AS(interface.isdas)
            link = interface.ifID
            try:
                addr, port = get_public_addr_array(sd.ifid2br[link])
            except KeyError:
                addr = ''
            list_add(s, "%s-%s (%s) %s" %
                     (isd_as._isd, isd_as._as, link, addr))
        i += 1
        indent_close(s)


def html_all_segments(s, csegs, usegs, dsegs):
    # enumerate segments
    html_segment(csegs, s, "CORE", "purple")
    html_segment(dsegs, s, "DOWN", "red")
    html_segment(usegs, s, "UP", "green")


def html_segment(segs, s, name, color):
    segidx = 0
    for seg in segs:
        p_segment(s, seg, segidx, name, color)
        segidx += 1


def get_json_segments(segs):
    cores = []
    for seg in segs:
        core = []
        for asms in seg.p.asms:
            core.append({
                "ISD": ISD_AS(asms.isdas)._isd,
                "AS": ISD_AS(asms.isdas)._as,
                "IFID": 0,
            })
        cores.append(core)
    path = {}
    path["if_lists"] = cores
    return path


def get_json_all_segments(csegs, usegs, dsegs):
    data = {}
    data["core_segments"] = get_json_segments(csegs)
    data["up_segments"] = get_json_segments(usegs)
    data["down_segments"] = get_json_segments(dsegs)
    return data


def get_json_paths(paths):
    cores = []
    for path in paths:
        core = []
        for interface in path.p.interfaces:
            core.append({
                "ISD": ISD_AS(interface.isdas)._isd,
                "AS": ISD_AS(interface.isdas)._as,
                "IFID": interface.ifID,
            })
        cores.append(core)
    path = {}
    path["if_lists"] = cores
    return path


def json_append_server(nodes, links, isd_as, v, type):
    nodes.append(get_json_server_node(v, type))
    links.append(get_json_internal_link(isd_as, v.name))
    return nodes, links


def json_append_router(nodes, links, isd_as, v, type):
    interface = get_router_interface(v)
    nodes.append(get_json_router_node(v, type))
    nodes.append(get_json_interface_node(interface))
    links.append(get_json_interface_link(v.name, interface))
    links.append(get_json_internal_link(isd_as, v.name))
    return nodes, links


def json_append_zookeeper(nodes, links, isd_as, v, name, idx):
    nodes.append(get_json_zookeeper_node(v, name, idx))
    links.append(get_json_internal_link(isd_as, "zk-%s" % idx))
    return nodes, links


def get_json_as_topology(t, topo):
    nodes = []
    links = []
    isd_as = str(t.isd_as)
    nodes.append(get_root_as_node(t))
    for servers in topo:
        idx = 1
        for v in topo[servers]:
            if servers in topo_servers:
                nodes, links = json_append_server(
                    nodes, links, isd_as, v, servers)
            elif servers in topo_br:
                nodes, links = json_append_router(
                    nodes, links, isd_as, v, servers)
            elif servers in topo_zk:
                nodes, links = json_append_zookeeper(
                    nodes, links, isd_as, v, servers, idx)
            idx += 1
    graph = {}
    graph["nodes"] = nodes
    graph["links"] = links
    return graph


def get_root_as_node(t):
    return {
        "name": str(t.isd_as),
        "type": "root",
        "icon": "ISD-AS",
        "group": get_grouping_index("ISD-AS"),
        "is_core_as": t.is_core_as,
        "mtu": t.mtu
    }


def get_json_internal_link(src, dst):
    return {
        "source": src,
        "target": dst,
        "type": "as-in"
    }


def get_json_zookeeper_node(v, name, idx):
    return {
        "name": "zk-%s" % idx,
        "type": "server",
        "icon": name,
        "group": get_grouping_index(name),
        "addr": v,
    }


def get_json_server_node(v, name):
    addr, port = get_public_addr(v)
    return {
        "name": v.name,
        "type": "server",
        "icon": name,
        "group": get_grouping_index(name),
        "addr": str(HostAddrIPv4(addr)),
        "port": port
    }


def get_json_router_node(v, name):
    addr, port = get_public_addr_array(v)
    r = {
        "name": v.name,
        "type": "router",
        "icon": "%s BORDER" % name,
        "group": get_grouping_index("%s BORDER" % name),
        "addr": str(HostAddrIPv4(addr)),
        "port": port,
    }
    interface = get_router_interface(v)
    i = get_json_interface(interface)
    r.update(i)
    return r


def get_json_interface(i):
    addr, port = get_public_addr(i)
    to_addr, to_port = get_remote_addr(i)
    return {
        "if_addr": str(HostAddrIPv4(addr)),
        "if_bandwidth": i.bandwidth,
        "if_id": i.if_id,
        "if_isd_as": str(i.isd_as),
        "if_link_type": i.link_type,
        "if_mtu": i.mtu,
        "if_name": i.name,
        "if_port": port,
        "if_to_addr": str(HostAddrIPv4(to_addr)),
        "if_to_if_id": i.to_if_id,
        "if_to_port": to_port,
    }


def get_json_interface_link(src, i):
    return {
        "source": src,
        "target": str(i.isd_as),
        "type": "as-%s" % i.link_type.lower(),
    }


def get_json_interface_node(i):
    addr, port = get_public_addr(i)
    return {
        "name": str(i.isd_as),
        "type": "interface",
        "icon": "ISD-AS",
        "group": get_grouping_index("ISD-AS"),
        "addr": str(HostAddrIPv4(addr)),
        "port": port
    }


def get_grouping_index(name):
    group = {
        'ISD-AS': 0,
        'BORDER': 1,
        'BEACON': 2,
        'CERTIFICATE': 3,
        'PATH': 4,
        'SIBRA': 5,
        'ZOOKEEPER': 6,
    }
    for type in group:
        if type in name:
            return group[type]


def get_json_path_interfaces(path):
    data = []
    last_i = None
    # enumerate path interfaces
    for interface in path.interfaces:
        if last_i:
            p = ISD_AS(interface.isdas)
            link_p = interface.ifID
            n = ISD_AS(last_i.isdas)
            link_n = last_i.ifID
            data.append({"a": str(p), "b": str(n), "al": link_p,
                         "bl": link_n, "ltype": "CHILD"})
            last_i = None

        last_i = interface

    return data


def add_seg_links(segs, data, links, ltype):
    for s in segs:
        for x in range(1, len(s.p.asms)):
            p = ISD_AS(s.p.asms[x - 1].isdas)
            n = ISD_AS(s.p.asms[x].isdas)
            data.append({"a": str(p), "b": str(n), "ltype": ltype})
            link = s.p.asms[x - 1].isdas + s.p.asms[x].isdas
            if link not in links:
                links.append(link)


def add_nonseg_links(paths, data, links, ltype):
    for path in paths:
        for x in range(1, len(path.p.interfaces)):
            p = ISD_AS(path.p.interfaces[x - 1].isdas)
            n = ISD_AS(path.p.interfaces[x].isdas)
            link = path.p.interfaces[x - 1].isdas + path.p.interfaces[x].isdas
            if link not in links:
                links.append(link)
                data.append({"a": str(p), "b": str(n), "ltype": ltype})


def get_json_path_segs(paths, csegs, usegs, dsegs):
    data = []
    links = []
    add_seg_links(csegs, data, links, "CORE")
    add_seg_links(usegs, data, links, "PARENT")
    add_seg_links(dsegs, data, links, "PARENT")
    add_nonseg_links(paths, data, links, "PEER")
    return data


def p_server_element(s, v, name):
    addr, port = get_public_addr(v)
    list_add(s, "%s" % v.name)
    indent_open(s)
    list_add(s, "%s SERVER" % name)
    list_add(s, "Address: %s" % HostAddrIPv4(addr))
    list_add(s, "Name: %s" % v.name)
    list_add(s, "Port: %s" % port)
    indent_close(s)


def p_router_element(s, v, name):
    addr, port = get_public_addr_array(v)
    list_add(s, "%s" % v.name)
    indent_open(s)
    list_add(s, "%s BORDER ROUTER" % name)
    list_add(s, "Address: %s" % HostAddrIPv4(addr))
    list_add(s, "Name: %s" % v.name)
    list_add(s, "Port: %s" % port)
    interface = get_router_interface(v)
    p_interface_element(s, interface)
    indent_close(s)


def p_zookeeper(s, v, idx):
    list_add(s, "zk-%s" % idx)
    indent_open(s)
    list_add(s, "%s" % v)
    indent_close(s)


def p_interface_element(s, i):
    addr, port = get_public_addr(i)
    to_addr, to_port = get_remote_addr(i)
    list_add(s, "INTERFACE")
    indent_open(s)
    list_add(s, "Address: %s" % HostAddrIPv4(addr))
    list_add(s, "Bandwidth: %s" % i.bandwidth)
    list_add(s, "Interface ID: %s" % i.if_id)
    list_add(s, "ISD AS: %s" % i.isd_as)
    list_add(s, "Link Type: %s" % i.link_type)
    list_add(s, "MTU: %s" % i.mtu)
    list_add(s, "Name: %s" % i.name)
    list_add(s, "Port: %s" % port)
    list_add(s, "To Address: %s" % HostAddrIPv4(to_addr))
    list_add(s, "To Interface ID: %s" % i.to_if_id)
    list_add(s, "To Port: %s" % to_port)
    indent_close(s)


def p_segment(s, seg, idx, name, color):
    list_add_head(s, idx, name, color)
    indent_open(s)
    list_add(s, "Expiration Time: %s" % seg._min_exp)
    p = seg.p
    # InfoOpaqueField
    list_add(s, "%s" % InfoOpaqueField(p.info))
    # PathSegment
    list_add(s, "Interface ID: %s" % p.ifID)
    list_add(s, "SIBRA Ext Up: %s" % p.exts.sibra.up)
    asmsidx = 0
    for asms in p.asms:
        p_as_marking(s, asms, asmsidx)
        asmsidx += 1
    indent_close(s)


def p_as_marking(s, asms, asmsidx):
    # ASMarking
    list_add(s, "AS Marking Block %s" % (asmsidx + 1))
    indent_open(s)
    list_add(s, "AS: %s" % ISD_AS(asms.isdas))
    list_add(s, "TRC: v%s" % asms.trcVer)
    list_add(s, "Cert: v%s" % asms.certVer)
    list_add(s, "Interface ID Size: %s" % asms.ifIDSize)
    list_add(s, "Hashtree Root: %s" % asms.hashTreeRoot.hex())
    list_add(s, "Signature: %s" % asms.sig.hex())
    list_add(s, "AS MTU: %s" % asms.mtu)
    pcbmsidx = 0
    for pcbms in asms.pcbms:
        p_pcb_marking(s, pcbms, pcbmsidx)
        pcbmsidx += 1
    indent_close(s)


def p_pcb_marking(s, pcbms, pcbmsidx):
    # PCBMarking
    list_add(s, "PCB Marking Block %s" % (pcbmsidx + 1))
    indent_open(s)
    list_add(s, "In: %s (%s) mtu = %s" %
             (ISD_AS(pcbms.inIA), pcbms.inIF, pcbms.inMTU))
    list_add(s, "Out: %s (%s)" % (ISD_AS(pcbms.outIA), pcbms.outIF))
    list_add(s, "%s" % HopOpaqueField(pcbms.hof))
    indent_close(s)


def indent_open(s):
    s.append("<ul>")


def indent_close(s):
    s.append("</ul>")


def list_add(s, str):
    s.append("<li><a href='#'>%s</a>" % str)


def list_attr_add(s, name, idx):
    s.append("<li seg-type='%s' seg-num=%s>" % (name, idx))


def list_add_head(s, idx, name, color):
    list_attr_add(s, name, idx)
    s.append("<a href='#' >%s " % name)
    if (name != 'PATH'):
        s.append("SEGMENT ")
    s.append("%s</a>" % (idx + 1))


def organize_topo(t):
    try:
        return {  # old api scion/commit/bec7de2b5e0d864b5b3dc5638eba41db4014fbd1
            'BEACON': t.beacon_servers,
            'CERTIFICATE': t.certificate_servers,
            'PATH': t.path_servers,
            'SIBRA': t.sibra_servers,
            'CORE_BR': t.core_border_routers,
            'PARENT_BR': t.parent_border_routers,
            'CHILD_BR': t.child_border_routers,
            'PEER_BR': t.peer_border_routers,
            'ZOOKEEPER': t.zookeepers,
        }
    except (AttributeError):
        return {  # current  api
            'BEACON': t.beacon_servers,
            'CERTIFICATE': t.certificate_servers,
            'PATH': t.path_servers,
            'SIBRA': t.sibra_servers,
            'BORDER': t.border_routers,
            'CORE_IF': t.core_interfaces,
            'PARENT_IF': t.parent_interfaces,
            'CHILD_IF': t.child_interfaces,
            'PEER_IF': t.peer_interfaces,
            'ZOOKEEPER': t.zookeepers,
        }


def get_router_interface(elem):
    try:
        interface = elem.interface
    except (AttributeError):
        interface = list(elem.interfaces.values())[0]
    return interface


def get_public_addr_array(elem):
    try:
        addr = elem.addr
    except (AttributeError):
        addr = elem.int_addrs[0].public[0][0]
    try:
        port = elem.port
    except (AttributeError):
        port = elem.int_addrs[0].public[0][1]
    return addr, port


def get_public_addr(elem):
    try:
        addr = elem.addr
    except (AttributeError):
        addr = elem.public[0][0]
    try:
        port = elem.port
    except (AttributeError):
        port = elem.public[0][1]
    return addr, port


def get_remote_addr(elem):
    try:
        addr = elem.to_addr
    except (AttributeError):
        addr = elem.remote[0][0]
    try:
        port = elem.to_udp_port
    except (AttributeError):
        port = elem.remote[0][1]
    return addr, port


def index(request):
    json_paths = None
    json_pathtopo = None
    json_segtopo = None
    json_astopo = None
    path_info = None
    src = dst = addr = ''
    if request.GET.get('src') and request.GET.get('dst'):
        src = request.GET.get('src')
        dst = request.GET.get('dst')
        s_isd_as = ISD_AS(src)
        d_isd_as = ISD_AS(dst)

        addr = haddr_parse("IPV4", "0.0.0.0")
        conf_dir = "%s/ISD%s/AS%s/endhost" % (GEN_PATH,
                                              d_isd_as._isd, d_isd_as._as)
        sd = SCIONDaemon.start(conf_dir, addr)

        t = sd.topology
        topo = organize_topo(t)
        paths, error = sd.get_paths(s_isd_as)
        if error != 0:
            print("Error: %s" % error)
        csegs = sd.core_segments()
        dsegs = sd.down_segments()
        usegs = sd.up_segments()

        path_info = get_as_view_html(sd, paths, csegs, usegs, dsegs)

        json_pathtopo = json.dumps(
            get_json_path_segs(paths, csegs, usegs, dsegs))
        print(json_pathtopo)

        json_astopo = json.dumps(get_json_as_topology(t, topo))
        print(json_astopo)

        json_segtopo = json.dumps(get_json_all_segments(csegs, usegs, dsegs))
        print(json_segtopo)

        json_paths = json.dumps(get_json_paths(paths))
        print(json_paths)

    return render(request, 'asviz/index.html', {
        'json_paths': json_paths,
        'json_pathtopo': json_pathtopo,
        'json_segtopo': json_segtopo,
        'json_astopo': json_astopo,
        'path_info': path_info,
        'src': src,
        'dst': dst,
    })
