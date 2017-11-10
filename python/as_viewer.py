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
from os.path import dirname as dir

import lib.app.sciond as lib_sciond
from lib.app.sciond import SCIONDConnectionError, SCIONDResponseError, PathRequestFlags
from lib.crypto.certificate_chain import get_cert_chain_file_path
from lib.crypto.trc import get_trc_file_path
from lib.defines import (
    AS_CONF_FILE,
    GEN_PATH,
    PATH_POLICY_FILE,
    SCIOND_API_SOCKDIR,
)
from lib.packet.host_addr import HostAddrIPv4
from lib.packet.opaque_field import HopOpaqueField, InfoOpaqueField
from lib.packet.scion_addr import ISD_AS
from lib.types import ServiceType

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
            SCION_ROOT, GEN_PATH, s_isd_as._isd, s_isd_as._as)
        sock_file = os.path.join(SCIOND_API_SOCKDIR, "sd%s.sock" % s_isd_as)
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
            launch_sciond(sock_file, addr)
        if args.t:  # as topology
            print_as_topology(s_isd_as, connector)
        if args.p:  # announced paths
            print_paths(s_isd_as, d_isd_as, connector)
        if args.c:  # config
            print_yml(os.path.join(conf_dir, AS_CONF_FILE))
        if args.pp:  # path policy
            print_yml(os.path.join(conf_dir, PATH_POLICY_FILE))
        if args.trc:  # TRC
            print_json(get_trc_file_path(conf_dir, s_isd_as._isd, 0))
        if args.crt:  # cert chain
            print_json(get_cert_chain_file_path(conf_dir, s_isd_as, 0))
    except (SCIONBaseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))


def launch_sciond(sock_file, addr):
    '''
    Launch sciond process with or without optional IP address when not using
    localhost.
    '''
    # we need an asynchronous call, use Popen()
    cmd = 'cd %s && bin/sciond --api-addr /run/shm/sciond/sd%s.sock sd%s \
        gen/ISD%s/AS%s/endhost' % (
        SCION_ROOT, s_isd_as, s_isd_as, s_isd_as._isd, s_isd_as._as)
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


def print_json(path):
    '''
    Prints the contents of the json file with indentations.
    '''
    logging.info(path)
    with open(path, 'r') as fin:
        parsed = json.load(fin)
    logging.info(json.dumps(parsed, indent=4))


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
        srvs = [ServiceType.BS, ServiceType.PS,
                ServiceType.CS, ServiceType.SIBRA]
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
        logging.info("Interfaces Len: %s" % len(path.p.path.interfaces))
        # enumerate path interfaces
        for interface in reversed(path.p.path.interfaces):
            isd_as = ISD_AS(interface.isdas)
            link = interface.ifID
            logging.info("%s-%s (%s)" %
                         (isd_as._isd, isd_as._as, link))

        i += 1


def print_segments_summary(csegs, dsegs, usegs):
    '''
    Print all up, down, and core segments in summary.
    :param csegs: Array of core segments.
    :param dsegs: Array of down segments.
    :param usegs: Array of up segments.
    '''
    logging.info("----------------- SEGMENTS")
    print_enum_segments(csegs, "CORE")
    print_enum_segments(dsegs, "DOWN")
    print_enum_segments(usegs, "UP")


def print_enum_segments(segs, type):
    '''
    Generic method to print array of segments
    :param segs: Array of segments.
    :param type: Segment type label.
    '''
    segidx = 1
    for seg in segs:
        p = seg.p
        logging.info("%s\t%s\thops: %s\t\tinterface id: %s" %
                     (type, segidx, len(p.asms), p.ifID))
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


def p_segment(seg, idx, name):
    '''
    Print segment detail.
    :param seg: Segment object.
    :param idx: Segment index (0-based).
    :param name: Segment label.
    '''
    logging.info("----------------- %s SEGMENT %s" % (name, idx + 1))
    logging.info("Expiration Time: %s" % seg._min_exp)
    p = seg.p
    # InfoOpaqueField
    logging.info("%s" % InfoOpaqueField(p.info))
    # PathSegment
    logging.info("Interface ID: %s" % p.ifID)
    logging.info("SIBRA Ext Up: %s" % p.exts.sibra.up)
    asmsidx = 1
    for asms in p.asms:
        p_as_marking(asms, asmsidx)
        asmsidx += 1


def p_as_marking(asms, idx):
    '''
    Print ASMarking object.
    :param asms: ASMarking object.
    :param idx: ASMarking index.
    '''
    # ASMarking
    logging.info("  ----------------- AS Marking Block %s" % idx)
    logging.info("  AS: %s" % ISD_AS(asms.isdas))
    logging.info("  TRC: v%s" % asms.trcVer)
    logging.info("  Cert: v%s" % asms.certVer)
    logging.info("  Interface ID Size: %s" % asms.ifIDSize)
    logging.info("  Hashtree Root: %s" % asms.hashTreeRoot.hex())
    logging.info("  Signature: %s" % asms.sig.hex())
    logging.info("  AS MTU: %s" % asms.mtu)
    pcbmsidx = 1
    for pcbms in asms.pcbms:
        p_pcb_marking(pcbms, pcbmsidx)
        pcbmsidx += 1


def p_pcb_marking(pcbms, idx):
    '''
    Print PCBMarking object.
    :param pcbms: PCBMarking object.
    :param idx: PCBMarking index.
    '''
    # PCBMarking
    logging.info("    ----------------- PCB Marking Block %s" % idx)
    logging.info("    In: %s (%s) mtu = %s" %
                 (ISD_AS(pcbms.inIA), pcbms.inIF, pcbms.inMTU))
    logging.info("    Out: %s (%s)" % (ISD_AS(pcbms.outIA), pcbms.outIF))
    logging.info("    %s" % HopOpaqueField(pcbms.hof))


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
