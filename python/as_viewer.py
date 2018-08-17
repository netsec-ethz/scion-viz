#!/usr/bin/python3
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
"""
:mod:`as_viewer` ---
=================================================
"""

import argparse
import json
import logging
import os
import subprocess
import time
import pathlib
from datetime import timedelta
from os.path import dirname as dir

import lib.app.sciond as lib_sciond
from lib.app.sciond import (
    get_default_sciond_path,
    SCIONDConnectionError,
    SCIONDResponseError,
)
from lib.crypto.util import CERT_DIR
from lib.defines import (
    AS_CONF_FILE,
    GEN_PATH,
    PATH_POLICY_FILE,
)
from lib.errors import SCIONBaseError
from lib.packet.host_addr import HostAddrIPv4
from lib.packet.scion_addr import ISD_AS
from lib.types import (
    PathSegmentType as PST,
    ServiceType,
)
from lib.util import iso_timestamp

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCION_ROOT = dir(dir(BASE_DIR))

# topology class definitions
topo_servers = ['BEACON', 'CERTIFICATE', 'PATH', 'SIBRA']
topo_br = ['CORE_BR', 'PARENT_BR', 'CHILD_BR', 'PEER_BR', 'BORDER']
topo_if = ['CORE_IF', 'PARENT_IF', 'CHILD_IF', 'PEER_IF']
topo_zk = ['ZOOKEEPER']
connector = {}


def init():
    '''
    Initialize logger and parse arguments.
    '''
    logger = logging.getLogger()
    handler = logging.StreamHandler()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    parser = argparse.ArgumentParser(
        description='SCION AS Path Viewer requires source and destination \
        ISD-ASes to analyze.')
    parser.add_argument('src_isdas', type=str, help='ISD-AS source.')
    parser.add_argument('dst_isdas', type=str, nargs='?',
                        help='ISD-AS destination.')
    parser.add_argument('--addr', type=str, default='',
                        help='ip address to bind to if not localhost')
    parser.add_argument('-t', action="store_true", default=False,
                        help='display source AS topology')
    parser.add_argument('-p', action="store_true", default=False,
                        help='display announced paths to destination')
    parser.add_argument('-trc', action="store_true",
                        default=False, help='display source TRC')
    parser.add_argument('-crt', action="store_true",
                        default=False, help='display source certificate chain')
    parser.add_argument('-c', action="store_true",
                        default=False, help='display source AS configuration')
    parser.add_argument('-pp', action="store_true",
                        default=False, help='display source path policy')
    parser.add_argument('-s', action="store_true", default=False,
                        help='display segments summary')

    args = parser.parse_args()
    s_isd_as = ISD_AS(args.src_isdas)
    d_isd_as = ISD_AS(args.dst_isdas)
    logging.info("")
    logging.info("SCION AS Viewer")
    logging.info("(src) %s =======================> %s (dst)" %
                 (args.src_isdas, args.dst_isdas))
    return args, d_isd_as, s_isd_as


def print_as_viewer_info(addr):
    '''
    Attempt sciond connection if needed, and print requested AS data.
    :param addr: Optional IP Address for sciond socket binding when not
        localhost.
    '''
    try:
        # init connection to sciond
        conf_dir = "%s/%s/ISD%s/AS%s/endhost" % (
            SCION_ROOT, GEN_PATH, s_isd_as.isd_str(), s_isd_as.as_file_fmt())
        sock_file = get_default_sciond_path(s_isd_as)
        if not pathlib.Path(sock_file).exists():
            sock_file = get_default_sciond_path(None)
        connector[s_isd_as] = lib_sciond.init(sock_file)
        logging.info(connector[s_isd_as]._api_addr)
        try:  # test if sciond is already running for this AS
            logging.info("Starting sciond at %s" % sock_file)
            lib_sciond.get_as_info(connector=connector[s_isd_as])
        except (SCIONDResponseError) as err:
            logging.error("%s: %s" % (err.__class__.__name__, err))
            return
        except (SCIONDConnectionError, FileNotFoundError) as err:
            logging.warning("%s: %s" % (err.__class__.__name__, err))
            # need to launch sciond, wait for uptime
            launch_sciond(sock_file, conf_dir, addr, s_isd_as)
        if args.t:  # as topology
            print_as_topology(s_isd_as, connector)
        if args.p:  # announced paths
            print_paths(s_isd_as, d_isd_as, connector)
        if args.c:  # config
            print_yml(os.path.join(conf_dir, AS_CONF_FILE))
        if args.pp:  # path policy
            print_yml(os.path.join(conf_dir, PATH_POLICY_FILE))
        if args.trc:  # TRC
            print_json_files(findCerts(conf_dir, ".trc"))
        if args.crt:  # cert chain
            print_json_files(findCerts(conf_dir, ".crt"))
        if args.s:  # segments
            print_segments_summary(s_isd_as, connector)
    except (SCIONBaseError, AttributeError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))


def launch_sciond(sock_file, conf_dir, addr, s_isd_as):
    '''
    Launch sciond process with or without optional IP address when not using
    localhost.
    '''
    cmd = 'cd %s && python/bin/sciond --api-addr %s sd%s %s' % (
        SCION_ROOT, sock_file, s_isd_as.file_fmt(), conf_dir)
    if addr and addr != '':
        cmd = '%s --addr %s' % (cmd, addr)
    logging.info("Listening for sciond: %s" % cmd)
    subprocess.Popen(cmd, shell=True)
    wait = 0
    while not os.path.exists(sock_file) and wait < 5:
        wait = wait + 1
        time.sleep(1)


def print_yml(path):
    '''
    Prints the contents of the file.
    '''
    logging.info(path)
    file = open(path, 'r')
    logging.info(file.read())


def print_json_files(paths):
    '''
    Prints the contents of json files with indentations.
    '''
    for path in paths:
        logging.info(path)
        with open(path, 'r') as fin:
            parsed = json.load(fin)
        logging.info(json.dumps(parsed, indent=4))


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


def print_as_topology(s_isd_as, connector):
    '''
    Print AS Topology data from lib.app.sciond.
    :param t: Array of ASInfo objects.
    :param i: Array of InterfaceInfo objects.
    :param s: Array of ServiceInfo objects.
    '''
    try:
        t = lib_sciond.get_as_info(connector=connector[s_isd_as])
        i = lib_sciond.get_if_info(connector=connector[s_isd_as])
        srvs = [ServiceType.BS, ServiceType.PS, ServiceType.CS]
        s = lib_sciond.get_service_info(srvs, connector=connector[s_isd_as])
    except (SCIONDResponseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))
        return
    for v in t:
        logging.info("----------------- AS TOPOLOGY: %s" % ISD_AS(v.p.isdas))
        logging.info("is_core_as: %s" % v.p.isCore)
        logging.info("mtu: %s" % v.p.mtu)
    for key in s:
        p_server_element(s[key])
    ridx = 1
    for key, v in i.items():
        p_router_element(v, ridx)
        ridx += 1


def print_paths(s_isd_as, d_isd_as, connector):
    '''
    Print AS announced paths data from lib.app.sciond.
    :param paths: Array of PathInfo objects.
    '''
    flags = lib_sciond.PathRequestFlags(flush=False, sibra=False)
    try:
        paths = lib_sciond.get_paths(
            d_isd_as, flags=flags, connector=connector[s_isd_as])
    except (SCIONDResponseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))
        return
    i = 1
    # enumerate all paths
    for path in paths:
        logging.info("----------------- PATH %s" % i)
        logging.info("MTU: %s" % path.p.path.mtu)
        logging.info("IPV4: %s" % HostAddrIPv4(path.p.hostInfo.addrs.ipv4))
        logging.info("Port: %s" % path.p.hostInfo.port)
        logging.info("Hops: %i" % (len(path.p.path.interfaces) / 2))
        # enumerate path interfaces
        for interface in path.p.path.interfaces:
            isd_as = ISD_AS(interface.isdas)
            link = interface.ifID
            logging.info("%s (%s)" %
                         (str(isd_as), link))

        i += 1


def print_segments_summary(s_isd_as, connector):
    '''
    Print all up, down, and core segments in summary.
    :param csegs: Array of core segments.
    :param dsegs: Array of down segments.
    :param usegs: Array of up segments.
    '''
    logging.info("----------------- SEGMENTS")
    csegs = lib_sciond.get_segtype_hops(
        PST.CORE, connector=connector[s_isd_as])
    usegs = lib_sciond.get_segtype_hops(
        PST.UP, connector=connector[s_isd_as])
    dsegs = lib_sciond.get_segtype_hops(
        PST.DOWN, connector=connector[s_isd_as])
    print_enum_segments(csegs, "CORE", True)
    print_enum_segments(dsegs, "DOWN")
    print_enum_segments(usegs, "UP", True)


def print_enum_segments(segs, type, rev=False):
    '''
    Generic method to print array of segments
    :param segs: Array of segments.
    :param type: Segment type label.
    '''
    segidx = 1
    for seg in segs:
        desc = []
        remain = seg.p.expTime - seg.p.timestamp
        desc.append("%s, %s" % (iso_timestamp(
            seg.p.timestamp), timedelta(seconds=remain)))
        if rev:
            ifs = list(reversed(seg.p.interfaces))
        else:
            ifs = seg.p.interfaces
        for if_ in ifs:
            desc.append(", %s:%s" % (ISD_AS(if_.isdas), if_.ifID))
        logging.info("%s %s\t%s" % (type, segidx, "".join(desc)))
        segidx += 1


def p_server_element(s):
    '''
    Print ServiceInfo object.
    :param s: ServiceInfo object.
    '''
    sidx = 1
    for hi in s.p.hostInfos:
        addr = hi.addrs.ipv4
        port = hi.port
        logging.info("----------------- %s SERVER:" %
                     get_service_type_name(str(s.p.serviceType)))
        logging.info("Address: %s" % HostAddrIPv4(addr))
        logging.info("Name: %s-%s" % (s.p.serviceType, sidx))
        logging.info("Port: %s" % port)
        logging.info("TTL: %s" % s.p.ttl)
        sidx += 1


def p_router_element(s, idx):
    '''
    Print InterfaceInfo object.
    :param s: InterfaceInfo object.
    :param idx: Index of interface (1-based).
    '''
    addr = s.p.hostInfo.addrs.ipv4
    port = s.p.hostInfo.port
    logging.info("----------------- %s ROUTER:" %
                 get_service_type_name(ServiceType.BR))
    logging.info("Address: %s" % HostAddrIPv4(addr))
    logging.info("Name: %s-%s" % (ServiceType.BR, idx))
    logging.info("Port: %s" % port)
    logging.info("Interface ID: %s" % s.p.ifID)


def p_zookeeper(s, idx):
    '''
    Print zookeeper data.
    :param s: Address and port.
    :param idx: Index of zookeeper (1-based).
    '''
    logging.info("----------------- %s:" % "zk")
    logging.info("Address: %s" % s)


def get_service_type_name(name):
    '''
    Parse sciond service type into readable label.
    :param name: sciond service type.
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


def organize_topo(t):
    '''
    Filters topology object array into type pairs.
    :param t: Topology array.
    '''
    return {
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


# parse commands, query sciond, display results
args, d_isd_as, s_isd_as = init()
print_as_viewer_info(args.addr)
