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
import logging
import os
import re
import subprocess
import time
from datetime import datetime
from django.shortcuts import render

import lib.app.sciond as lib_sciond
from as_viewer.settings import SCION_ROOT
from lib.app.sciond import SCIONDConnectionError, SCIONDResponseError
from lib.crypto.util import CERT_DIR
from lib.defines import (
    GEN_PATH,
    SCIOND_API_SOCKDIR,
    TOPO_FILE,
)
from lib.errors import SCIONBaseError
from lib.packet.host_addr import HostAddrIPv4
from lib.packet.scion_addr import ISD_AS
from lib.topology import Topology
from lib.types import (
    PathSegmentType as PST,
    ServiceType,
)
from lib.util import iso_timestamp

# topology class definitions
topo_servers = ['BEACON', 'CERTIFICATE', 'PATH', 'SIBRA']
topo_br = ['CORE_BR', 'PARENT_BR', 'CHILD_BR', 'PEER_BR', 'BORDER']
topo_if = ['CORE_IF', 'PARENT_IF', 'CHILD_IF', 'PEER_IF']
topo_zk = ['ZOOKEEPER']

logging = logging.getLogger("asviz")

as_topo_path = ''
sock_file = ''
trc_path = ''
crt_path = ''
connector = {}


def get_as_view_html(paths, csegs, usegs, dsegs):
    '''
    Formats paths and segments into nested html.
    '''
    s = []
    s.append("<ul class='tree'>")
    html_paths(s, paths)
    html_all_segments(s, csegs, usegs, dsegs)
    indent_close(s)

    out_str = ''
    for str in s:
        out_str += (str + '\n')
    return out_str


def html_paths(s, paths):
    '''
    Formats multiple paths to nested html
    :param paths:
    '''
    i = 0
    # enumerate all paths
    for path in paths:
        list_add_head(s, i, "PATH", "black")
        indent_open(s)
        list_add(s, "MTU: %s" % path.p.path.mtu)
        list_add(s, "IPV4: %s" % HostAddrIPv4(path.p.hostInfo.addrs.ipv4))
        list_add(s, "Port: %s" % path.p.hostInfo.port)
        list_add(s, "Hops: %i" % (len(path.p.path.interfaces) / 2))
        # enumerate path interfaces
        for interface in path.p.path.interfaces:
            isd_as = ISD_AS(interface.isdas)
            link = interface.ifID
            list_add(s, "%s (%s)" % (str(isd_as), link))
        i += 1
        indent_close(s)


def html_all_segments(s, csegs, usegs, dsegs):
    '''
    Formats all segments into nested html.
    '''
    # enumerate segments
    html_segment(csegs, s, "CORE", "red", True)
    html_segment(dsegs, s, "DOWN", "blue")
    html_segment(usegs, s, "UP", "green", True)


def html_segment(segs, s, name, color, rev=False):
    '''
    Formats a single segment to nested html
    '''
    segidx = 0
    for seg in segs:
        p_segment(s, seg, segidx, name, color, rev)
        segidx += 1


def get_json_segments(segs):
    '''
    Formats segments to json.
    '''
    cores = []
    for seg in segs:
        core = []
        for interface in seg.p.interfaces:
            isd_ui, as_ui = parse_isdas(ISD_AS(interface.isdas))
            core.append({
                "ISD": isd_ui,
                "AS": as_ui,
                "IFID": interface.ifID,
            })
        cores.append({
            "interfaces": core,
            "timestamp": seg.p.timestamp,
            "expTime": seg.p.expTime,
        })
    path = {}
    path["if_lists"] = cores
    return path


def get_json_all_segments(csegs, usegs, dsegs):
    '''
    Format all segments to json.
    '''
    data = {}
    data["core_segments"] = get_json_segments(csegs)
    data["up_segments"] = get_json_segments(usegs)
    data["down_segments"] = get_json_segments(dsegs)
    logging.debug(data)
    return data


def get_json_paths(paths):
    '''
    Formats all paths to json for path graph.
    '''
    cores = []
    logging.info("\n-------- SCIOND: Paths")
    for path in paths:
        logging.debug(path.__dict__)
        core = []
        for interface in path.p.path.interfaces:
            isd_ui, as_ui = parse_isdas(ISD_AS(interface.isdas))
            core.append({
                "ISD": isd_ui,
                "AS": as_ui,
                "IFID": interface.ifID,
            })
        cores.append({
            "interfaces": core,
        })
    path = {}
    path["if_lists"] = cores
    logging.debug(path)
    return path


def json_append_server(nodes, links, isd_as, label, type, addr, port):
    '''
    Creates json format server data for AS topology graph
    '''
    nodes.append(get_json_server_node(label, type, addr, port))
    links.append(get_json_internal_link(isd_as, label))
    return nodes, links


def json_append_router(nodes, links, isd_as, label, type, addr, port, ifID):
    '''
    Create json formatted router data for AS topology graph
    '''
    nodes.append(get_json_router_node(label, type, addr, port, ifID))
    links.append(get_json_internal_link(isd_as, label))
    return nodes, links


def json_append_zookeeper(nodes, links, isd_as, v, name, idx):
    '''
    Create json formatted zookeeper for AS topology graph
    '''
    nodes.append(get_json_zookeeper_node(v, name, idx))
    links.append(get_json_internal_link(isd_as, "zk-%s" % idx))
    return nodes, links


def get_json_as_topology_sciond(connector, paths):
    '''
    Format all sciond AS topology data as a graph.
    Data comes from lib.app.sciond.
    '''
    nodes = []
    links = []
    try:
        logging.info("\n-------- SCIOND: AS Info")
        t = lib_sciond.get_as_info(connector=connector)
        for v in t:
            logging.debug(v.__dict__)
            isd_as = str(ISD_AS(v.p.isdas))
            nodes.append(get_root_as_node(isd_as, v.p.isCore, v.p.mtu))

        logging.info("\n-------- SCIOND: Interface Info")
        if_idx = 0
        i = lib_sciond.get_if_info(connector=connector)
        for key, v in i.items():
            logging.debug('%s: %s' % (key, v.__dict__))
            addr = v.p.hostInfo.addrs.ipv4
            port = v.p.hostInfo.port
            label = '%s-%s' % (ServiceType.BR, if_idx + 1)
            type = ServiceType.BR
            ifID = v.p.ifID
            nodes, links = json_append_router(
                nodes, links, isd_as, label, type, addr, port, ifID)

            # find any matching interfaces from paths
            if_id = v.p.ifID
            if_isd_as = "(%s)" % if_id
            for path in paths:
                match = False
                for interface in path.p.path.interfaces:
                    if match:
                        if_isd_as = "%s (%s)" % (
                            ISD_AS(interface.isdas), if_id)
                        break
                    if interface.ifID == v.p.ifID:
                        match = True

            link_type = "PARENT"
            nodes.append(get_json_interface_node_sciond(if_isd_as))
            links.append(get_json_interface_link(label, if_isd_as, link_type))
            if_idx += 1

        logging.info("\n-------- SCIOND: Service Info")
        srvs = [ServiceType.BS, ServiceType.PS, ServiceType.CS]
        v = lib_sciond.get_service_info(
            srvs, connector=connector)
        for key in v:
            logging.debug(v[key].__dict__)
            sidx = 0
            for hi in v[key].p.hostInfos:
                addr = hi.addrs.ipv4
                port = hi.port
                label = '%s-%s' % (v[key].p.serviceType, sidx + 1)
                type = str(v[key].p.serviceType)
                nodes, links = json_append_server(
                    nodes, links, isd_as, label, type, addr, port)
                sidx += 1

    except (SCIONDResponseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))

    graph = {}
    graph["nodes"] = nodes
    graph["links"] = links
    logging.debug(graph)
    return graph


def get_json_as_topology(t, topo):
    '''
    Format all sciond AS topology data as a graph.
    Data comes from SCIONDaemon.topology.
    '''
    nodes = []
    links = []
    isd_as = str(t.isd_as)
    nodes.append(get_root_as_node(str(t.isd_as), t.is_core_as, t.mtu))
    for servers in topo:
        idx = 1
        for v in topo[servers]:
            logging.info(v)
            if servers in topo_servers:
                addr = v.public[0][0]
                port = v.public[0][1]
                nodes, links = json_append_server(
                    nodes, links, isd_as, v.name, servers, addr, port)
            elif servers in topo_br:
                logging.info(v.interfaces)
                interface = list(v.interfaces.values())[0]
                addr = v.int_addrs[0].public[0][0]
                port = v.int_addrs[0].public[0][1]
                link_type = interface.link_type
                ifID = interface.if_id
                nodes, links = json_append_router(
                    nodes, links, isd_as, v.name, servers, addr, port, ifID)
                nodes.append(get_json_interface_node(interface))
                links.append(get_json_interface_link(
                    v.name, interface.isd_as, link_type))
            elif servers in topo_zk:
                nodes, links = json_append_zookeeper(
                    nodes, links, isd_as, v, servers, idx)
            idx += 1
    graph = {}
    graph["nodes"] = nodes
    graph["links"] = links
    logging.debug(graph)
    return graph


def get_root_as_node(name, is_core, mtu):
    '''
    Get AS Info for json graph
    '''
    return {
        "name": name,
        "type": "root",
        "icon": get_service_type_name("ISD-AS"),
        "group": get_grouping_index("ISD-AS"),
        "is_core_as": is_core,
        "mtu": mtu
    }


def get_json_internal_link(src, dst):
    '''
    Get AS internal node link for json graph
    '''
    return {
        "source": src,
        "target": dst,
        "type": "as-in"
    }


def get_json_zookeeper_node(addr, name, idx):
    '''
    Create zookeeper node for graph
    '''
    return {
        "name": "zk-%s" % idx,
        "type": "server",
        "icon": get_service_type_name(name),
        "group": get_grouping_index(name),
        "addr": addr,
    }


def get_json_server_node(label, name, addr, port):
    '''
    Create server node for graph
    '''
    return {
        "name": label,
        "type": "server",
        "icon": get_service_type_name(name),
        "group": get_grouping_index(name),
        "addr": str(HostAddrIPv4(addr)),
        "port": port
    }


def get_json_router_node(label, name, addr, port, ifID):
    '''
    Create router node for graph
    '''
    return {
        "name": label,
        "type": "router",
        "icon": get_service_type_name(name),
        "group": get_grouping_index(name),
        "addr": str(HostAddrIPv4(addr)),
        "port": port,
        "if_id": ifID,
    }


def get_json_interface(i):
    '''
    Create external AS interface node for graph
    '''
    addr = i.public[0][0]
    port = i.public[0][1]
    to_addr = i.remote[0][0]
    to_port = i.remote[0][1]
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


def get_json_interface_link(src, isd_as, link_type):
    '''
    Create external AS interface link for graph
    '''
    return {
        "source": src,
        "target": str(isd_as),
        "type": "as-%s" % link_type.lower(),
    }


def get_json_interface_node(i):
    '''
    Create external AS interface node for graph direct bind
    '''
    return {
        "name": str(i.isd_as),
        "type": "interface",
        "icon": get_service_type_name("ISD_AS"),
        "group": get_grouping_index("ISD-AS"),
        "public addr": str(HostAddrIPv4(i.public[0][0])),
        "public port": i.public[0][1],
        "remote addr": str(HostAddrIPv4(i.remote[0][0])),
        "remote port": i.remote[0][1],
        "link_type": i.link_type,
        "bandwidth": i.bandwidth,
        "mtu": i.mtu,
        "overlay": i.overlay,
        "to_if_id": i.to_if_id,
    }


def get_json_interface_node_sciond(isd_as):
    '''
    Create external AS interface node for graph socket bind
    '''
    return {
        "name": str(isd_as),
        "type": "interface",
        "icon": "ISD-AS",
        "group": get_grouping_index("ISD-AS"),
    }


def get_grouping_index(name):
    '''
    Return consistent node type id for graph
    '''
    group = {
        'ISD-AS': 0,
        'isdas': 0,
        'BORDER': 1,
        'br': 1,
        'BEACON': 2,
        'bs': 2,
        'CERTIFICATE': 3,
        'cs': 3,
        'PATH': 4,
        'ps': 4,
        'SIBRA': 5,
        'sb': 5,
        'ZOOKEEPER': 6,
        'zk': 6,
    }
    for type in group:
        if type in name:
            return group[type]


def get_service_type_name(name):
    '''
    Get human readable name for service type
    '''
    group = {
        'isdas': 'ISD-AS',
        'br': 'BORDER',
        'bs': 'BEACON',
        'cs': 'CERTIFICATE',
        'ps': 'PATH',
        'sb': 'SIBRA',
        'zk': 'ZOOKEEPER',
    }
    for type in group:
        if type in name:
            return group[type]
    # default
    return name


def get_json_path_interfaces(path):
    '''
    Format json data for paths graph
    '''
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
    '''
    Add standard links to paths graph
    '''
    for s in segs:
        for x in range(1, len(s.p.interfaces)):
            p = ISD_AS(s.p.interfaces[x - 1].isdas)
            n = ISD_AS(s.p.interfaces[x].isdas)
            data.append({"a": str(p), "b": str(n), "ltype": ltype})
            link = "%s,%s" % (
                s.p.interfaces[x - 1].isdas, s.p.interfaces[x].isdas)
            if link not in links:
                links.append(link)


def add_nonseg_links(paths, data, links, ltype):
    '''
    Add remaining peering links to path graph
    '''
    for path in paths:
        for x in range(1, len(path.p.path.interfaces)):
            p = ISD_AS(path.p.path.interfaces[x - 1].isdas)
            n = ISD_AS(path.p.path.interfaces[x].isdas)
            link = "%s,%s" % (path.p.path.interfaces[x - 1].isdas,
                              path.p.path.interfaces[x].isdas)
            link_r = "%s,%s" % (path.p.path.interfaces[x].isdas,
                                path.p.path.interfaces[x - 1].isdas)
            # confirm either direction is not a duplicate
            if link not in links and link_r not in links:
                links.append(link)
                data.append({"a": str(p), "b": str(n), "ltype": ltype})


def get_json_path_segs(paths, csegs, usegs, dsegs):
    '''
    Create path segments for graph overlay
    '''
    data = []
    links = []
    segs = len(csegs) + len(usegs) + len(dsegs)
    if segs > 0:
        nonseg_ltype = "PEER"
    else:
        nonseg_ltype = "CHILD"
    add_seg_links(csegs, data, links, "CORE")
    add_seg_links(usegs, data, links, "PARENT")
    add_seg_links(dsegs, data, links, "PARENT")
    add_nonseg_links(paths, data, links, nonseg_ltype)
    logging.debug(data)
    return data


def p_segment(s, seg, idx, name, color, rev):
    '''
    Add segment to html list
    '''
    list_add_head(s, idx, name, color)
    indent_open(s)
    list_add(s, "Creation: %s" % iso_timestamp(seg.p.timestamp))
    list_add(s, "Expiration: %s" % iso_timestamp(seg.p.expTime))
    list_add(s, "Hops: %i" % (len(seg.p.interfaces) / 2))
    # enumerate path interfaces
    if rev:
        interfaces = reversed(seg.p.interfaces)
    else:
        interfaces = seg.p.interfaces
    for interface in interfaces:
        isd_as = ISD_AS(interface.isdas)
        link = interface.ifID
        list_add(s, "%s (%s)" % (str(isd_as), link))
    indent_close(s)


def indent_open(s):
    '''
    Open html list
    '''
    s.append("<ul>")


def indent_close(s):
    '''
    Close html list
    '''
    s.append("</ul>")


def list_add(s, str):
    '''
    Add individual data element to html list
    '''
    s.append("<li><a href='#'>%s</a>" % str)


def list_attr_add(s, name, idx):
    '''
    Add html path segment data to string
    '''
    s.append("<li seg-type='%s' seg-num=%s>" % (name, idx))


def list_add_head(s, idx, name, color):
    '''
    Add html segment header to string
    '''
    list_attr_add(s, name, idx)
    s.append("<a href='#' >%s " % name)
    if (name != 'PATH'):
        s.append("SEGMENT ")
    s.append("%s</a>" % (idx + 1))


def organize_topo(t):
    '''
    Filters topology object array into type pairs.
    :param t: Topology array.
    '''
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


def html_jsonfile(paths):
    '''
    Parses json data into html nested lists.
    :param paths: Paths to json files.
    '''
    s = []
    s.append("<ul class='tree'>")
    for path in paths:
        logging.info(path)
        with open(path, 'r') as fin:
            file = json.load(fin)
        list_add(s, "<b>%s</b>" % os.path.basename(path))
        indent_open(s)
        step_json(s, file)
        indent_close(s)
    indent_close(s)
    out_str = ''
    for str in s:
        out_str += (str + '\n')
    logging.info(out_str)
    return out_str


def camel_2_title(label):
    '''
    Convert key name camel case into title case.
    :param label: Camel-cased label.
    '''
    return re.sub("([a-z])([A-Z])", "\g<1> \g<2>", label)


def step_json(s, d):
    '''
    Append next html list item based on json level.
    :param s: Current html output string.
    :param d: Current json input.
    '''
    for k, v in d.items():
        if isinstance(v, str) or isinstance(v, int) or isinstance(v, float):
            # parse time into readable format
            if isinstance(v, int) and "Time" in k:
                time = datetime.utcfromtimestamp(v).strftime(
                    "%Y-%m-%d %H:%M:%S.%f UTC")
                list_add(s, "<b>%s</b>: %s" % (camel_2_title(k), time))
            else:
                list_add(s, "<b>%s</b>: %s" % (camel_2_title(k), v))
        elif v is None:
            list_add(s, "<b>%s</b>: %s" % (camel_2_title(k), v))
        elif isinstance(v, dict):
            list_add(s, "<b>%s</b>" % camel_2_title(k))
            indent_open(s)
            step_json(s, v)
            indent_close(s)
        else:
            logging.error(
                "!!!!! Value %s not recognized for key %s." % (v, k))


def set_param(request, name, default):
    '''
    Generic handler for validating incoming url parameters.
    :param request: HTML request object containing url parameters.
    :param name: Parameter name.
    :param default: Default value of parameter.
    '''
    value = request.GET.get(name)
    logging.info("%s = %s" % (name, value))
    if not value or value == '':
        value = default
    return value


def launch_sciond(sock_file, addr, s_isd_as):
    # we need an asynchronous call, use Popen()
    isd_file, as_file = parse_isdas(s_isd_as, file=True)
    cmd = 'cd %s && python/bin/sciond --api-addr /run/shm/sciond/sd%s.sock \
        sd%s gen/ISD%s/AS%s/endhost' % (
        SCION_ROOT, s_isd_as, s_isd_as, isd_file, as_file)
    if addr and addr != '':
        cmd = '%s --addr %s' % (cmd, addr)
    logging.info("Listening for sciond: %s" % cmd)
    subprocess.Popen(cmd, shell=True)
    wait = 0
    while not os.path.exists(sock_file) and wait < 5:
        wait = wait + 1
        time.sleep(1)


def findCerts(conf_dir, extension):
    '''
    Returns all cert paths based on extension.
    '''
    certs = []
    certDir = os.path.join(conf_dir, CERT_DIR)
    for file in os.listdir(certDir):
        if file.endswith(extension):
            certs.append(os.path.join(certDir, file))
    return certs


def parse_isdas(isd_as, file=False):
    '''
    Parses ISD_AS object for UI and file-friendly ISD-AS pairs.
    :param isd_as: ISD_AS object.
    '''
    try:
        isd = isd_as.isd_str()
        if file:
            as_ = isd_as.as_file_fmt()
        else:
            as_ = isd_as.as_str()
    except (AttributeError) as err:
        logging.warn(err)
        isd = isd_as._isd
        as_ = isd_as._as
    return isd, as_


def index(request):
    '''
    Main index handler for index.html for main visualization page.
    Validates parameters, request scion data, returns formatted response.
    :param request: HTML request object containing url parameters.
    '''
    p = {}  # return param dictionary
    p['tab'] = set_param(request, 'tab', 'tab-pathtopo')
    p['data'] = set_param(request, 'data', 'sdapi')
    p['addr'] = set_param(request, 'addr', '')
    p['src'] = set_param(request, 'src', '')
    p['dst'] = set_param(request, 'dst', '')
    p['mp'] = set_param(request, 'mp', '5')
    p['err'] = ''
    if (p['src'] == '' and p['dst'] == ''):
        return fmt_err(request, p)
    s_isd_as = ISD_AS(p['src'])
    d_isd_as = ISD_AS(p['dst'])
    p['src'], p['dst'] = str(s_isd_as), str(d_isd_as)  # reformat
    csegs = dsegs = usegs = []
    paths = ''
    logging.info("Requesting sciond data from %s to %s" % (s_isd_as, d_isd_as))
    try:
        if (p['data'] == 'sdapi'):
            sock_file = os.path.join(
                SCIOND_API_SOCKDIR, "sd%s.sock" % s_isd_as)
            connector[s_isd_as] = lib_sciond.init(sock_file)
            logging.info(connector[s_isd_as]._api_addr)

            try:  # test if sciond is already running for this AS
                logging.info("Testing sciond at %s" % sock_file)
                lib_sciond.get_as_info(connector=connector[s_isd_as])
            except (SCIONDResponseError) as err:
                p['err'] = "%s: %s" % (err.__class__.__name__, err)
                return fmt_err(request, p)
            except (SCIONDConnectionError, FileNotFoundError) as err:
                logging.warning("%s: %s" % (err.__class__.__name__, err))
                # need to launch sciond, wait for uptime
                launch_sciond(sock_file, p['addr'], s_isd_as)

            if (p['dst'] != ''):  # PATHS
                try:
                    # get paths and keep segments
                    flags = lib_sciond.PathRequestFlags(flush=False,
                                                        sibra=False)
                    paths = lib_sciond.get_paths(d_isd_as, max_paths=int(
                        p['mp']), flags=flags, connector=connector[s_isd_as])
                    csegs = lib_sciond.get_segtype_hops(
                        PST.CORE, connector=connector[s_isd_as])
                    dsegs = lib_sciond.get_segtype_hops(
                        PST.DOWN, connector=connector[s_isd_as])
                    usegs = lib_sciond.get_segtype_hops(
                        PST.UP, connector=connector[s_isd_as])
                    # refresh old segments for next call
                    flags = lib_sciond.PathRequestFlags(flush=True,
                                                        sibra=False)
                    lib_sciond.get_paths(d_isd_as, max_paths=int(
                        p['mp']), flags=flags, connector=connector[s_isd_as])
                except (SCIONDResponseError, SCIONDConnectionError,
                        AttributeError) as err:
                    # AttributeError handles backward-compatability
                    logging.error("%s: %s" % (err.__class__.__name__, err))
                    p['err'] = str(err)
            p['json_as_topo'] = json.dumps(
                get_json_as_topology_sciond(connector[s_isd_as], paths))
            p['json_trc'] = ("TRC information for sciond not yet implemented.")
            p['json_crt'] = (
                "Certificate information for sciond not yet implemented.")
        elif (p['data'] == 'file'):
            isd_file, as_file = parse_isdas(s_isd_as, file=True)
            conf_dir = "%s/%s/ISD%s/AS%s/endhost" % (
                SCION_ROOT, GEN_PATH, isd_file, as_file)
            t = Topology.from_file(os.path.join(conf_dir, TOPO_FILE))
            topo = organize_topo(t)
            p['json_as_topo'] = json.dumps(get_json_as_topology(t, topo))
            p['json_trc'] = html_jsonfile(findCerts(conf_dir, ".trc"))
            p['json_crt'] = html_jsonfile(findCerts(conf_dir, ".crt"))
        p['path_info'] = get_as_view_html(paths, csegs, usegs, dsegs)
        p['json_path_topo'] = json.dumps(
            get_json_path_segs(paths, csegs, usegs, dsegs))
        p['json_seg_topo'] = json.dumps(
            get_json_all_segments(csegs, usegs, dsegs))
        p['json_paths'] = json.dumps(get_json_paths(paths))
    except (SCIONBaseError) as err:
        p['err'] = "%s: %s" % (err.__class__.__name__, err)
        return fmt_err(request, p)
    return render(request, 'asviz/index.html', p)


def fmt_err(request, params):
    '''
    Format error message with to return with null response.
    '''
    logging.error(params['err'])
    params['json_trc'] = ''
    params['json_crt'] = ''
    params['json_paths'] = '{}'
    params['json_path_topo'] = '{}'
    params['json_seg_topo'] = '{}'
    params['json_as_topo'] = '{"links": [], "nodes": []}'
    params['path_info'] = ''
    return render(request, 'asviz/index.html', params)
