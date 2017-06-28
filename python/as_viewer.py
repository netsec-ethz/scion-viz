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
import pprint
import subprocess
import time

import lib.app.sciond as lib_sciond
from lib.app.sciond import SCIONDConnectionError, SCIONDResponseError
from lib.config import Config
from lib.crypto.certificate_chain import get_cert_chain_file_path
from lib.crypto.trc import get_trc_file_path
from lib.defines import (
    AS_CONF_FILE,
    GEN_PATH,
    PATH_POLICY_FILE,
    SCIOND_API_SOCKDIR,
    TOPO_FILE,
)
from lib.packet.host_addr import HostAddrIPv4, haddr_parse
from lib.packet.opaque_field import HopOpaqueField, InfoOpaqueField
from lib.packet.scion_addr import ISD_AS, SCIONAddr
from lib.path_store import PathPolicy
from lib.topology import Topology
from lib.types import ServiceType

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


def init():
    logger = logging.getLogger()
    handler = logging.StreamHandler()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

    parser = argparse.ArgumentParser(
        description='SCION AS Path Viewer requires source and destination ISD-ASes to analyze.')
    parser.add_argument('src_isdas', type=str, help='ISD-AS source.')
    parser.add_argument('dst_isdas', type=str,
                        help='ISD-AS destination.')  # optional
    parser.add_argument('-t', action="store_true", default=False,
                        help='display source AS topology')
    parser.add_argument('-p', action="store_true",
                        default=False, help='display announced paths to destination')
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
    logging.info("SCION AS Viewer for path...")
    logging.info("(src) %s =======================> %s (dst)" %
                 (args.src_isdas, args.dst_isdas))
    return args, d_isd_as, s_isd_as


def print_as_viewer_info(myaddr, dst_isd_as):
    # init connection to sciond
    addr = haddr_parse("IPV4", "0.0.0.0")
    conf_dir = "%s/ISD%s/AS%s/endhost" % (GEN_PATH,
                                          s_isd_as._isd, s_isd_as._as)
    sock_file = os.path.join(SCIOND_API_SOCKDIR, "%s.sock" % s_isd_as)
    connector = lib_sciond.init(sock_file)

    # test if sciond is already running for this AS
    try:
        paths = lib_sciond.get_paths(d_isd_as)
    except (SCIONDResponseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))
        return
    except (SCIONDConnectionError, FileNotFoundError) as err:
        logging.warning("%s: %s" % (err.__class__.__name__, err))

        # need to launch sciond, wait for uptime
        print("Starting sciond at %s" % sock_file)
        cmd = './scion.sh sciond %s' % s_isd_as
        p = subprocess.Popen(['xterm', '-e', cmd])
        while not os.path.exists(sock_file):
            time.sleep(1)

    try:
        # arguments
        if args.t:  # as topology
            t = Topology.from_file(os.path.join(conf_dir, TOPO_FILE))
            print_as_topology(t)

            # kills sciond: lib_sciond.get_service_info([ServiceType.BR,
            # ServiceType.SIBRA])
            srvs = [ServiceType.BS, ServiceType.PS, ServiceType.CS]
            v = lib_sciond.get_service_info(srvs)
            for key in v:
                logging.info(v[key].__dict__)

            t = lib_sciond.get_as_info()
            for value in t:
                logging.info(value.__dict__)

            i = lib_sciond.get_if_info()
            for key, value in i.items():
                logging.info(value.__dict__)

        if args.p:  # announced paths
            paths = lib_sciond.get_paths(d_isd_as)
            print_paths(addr, paths)

    except (SCIONDResponseError) as err:
        logging.error("%s: %s" % (err.__class__.__name__, err))
        return

    if args.c:  # config
        c = Config.from_file(os.path.join(conf_dir, AS_CONF_FILE))
        logging.info(c.__dict__)

    if args.pp:  # path policy
        pp = PathPolicy.from_file(os.path.join(conf_dir, PATH_POLICY_FILE))
        logging.info(pp.__dict__)

    if args.trc:  # TRC
        trc_ver = 0
        trc_path = get_trc_file_path(conf_dir, s_isd_as._isd, trc_ver)
        print (trc_path)
        with open(trc_path, 'r') as fin:
            parsed = json.load(fin)
        logging.info(json.dumps(parsed, indent=4))

    if args.crt:  # cert chain
        crt_ver = 0
        crt_path = get_cert_chain_file_path(conf_dir, s_isd_as, crt_ver)
        print (crt_path)
        with open(crt_path, 'r') as fin:
            parsed = json.load(fin)
        logging.info(json.dumps(parsed, indent=4))


def print_as_topology(t):
    logging.info("----------------- AS TOPOLOGY: %s" % t.isd_as)
    logging.info("is_core_as: %s" % t.is_core_as)
    logging.info("mtu: %s" % t.mtu)
    topo = organize_topo(t)
    for servers in topo:
        for s in topo[servers]:
            if servers in topo_servers:
                p_server_element(s, servers)
            elif servers in topo_br:
                p_router_element(s, servers)
            elif servers in topo_zk:
                p_zookeeper(s, servers)


def print_paths(addr, paths):
    i = 1
    # enumerate all paths
    for path in paths:
        logging.info("----------------- PATH %s" % i)
        logging.info("MTU: %s" % path.p.path.mtu)
        logging.info("Interfaces Len: %s" % len(path.p.path.interfaces))
        # enumerate path interfaces
        for interface in reversed(path.p.path.interfaces):
            isd_as = ISD_AS(interface.isdas)
            link = interface.ifID

            # try:
            #addr, port = get_public_addr_array(sd.ifid2br[link])
            # except (KeyError):
            addr = ''
            logging.info("%s-%s (%s) %s" %
                         (isd_as._isd, isd_as._as, link, addr))

        i += 1


def print_segments_summary(csegs, dsegs, usegs):
    logging.info("----------------- SEGMENTS")
    print_enum_segments(csegs, "CORE")
    print_enum_segments(dsegs, "DOWN")
    print_enum_segments(usegs, "UP")


def print_enum_segments(segs, type):
    segidx = 1
    for seg in segs:
        p = seg.p
        logging.info("%s\t%s\thops: %s\t\tinterface id: %s" %
                     (type, segidx, len(p.asms), p.ifID))
        segidx += 1


def p_server_element(s, name):
    addr, port = get_public_addr(s)
    logging.info("----------------- %s SERVER:" % name)
    logging.info("Address: %s" % HostAddrIPv4(addr))
    logging.info("Name: %s" % s.name)
    logging.info("Port: %s" % port)


def p_router_element(s, name):
    addr, port = get_public_addr_array(s)
    logging.info("----------------- %s BORDER ROUTER:" % name)
    logging.info("Address: %s" % HostAddrIPv4(addr))
    logging.info("Name: %s" % s.name)
    logging.info("Port: %s" % port)
    interface = get_router_interface(s)
    p_interface_element(interface)


def p_zookeeper(s, name):
    logging.info("----------------- %s:" % name)
    logging.info("Address: %s" % s)


def p_interface_element(i):
    addr, port = get_public_addr(i)
    to_addr, to_port = get_remote_addr(i)
    logging.info("  ----------------- INTERFACE:")
    logging.info("  Address: %s" % HostAddrIPv4(addr))
    logging.info("  Bandwidth: %s" % i.bandwidth)
    logging.info("  Interface ID: %s" % i.if_id)
    logging.info("  ISD AS: %s" % i.isd_as)
    logging.info("  Link Type: %s" % i.link_type)
    logging.info("  MTU: %s" % i.mtu)
    logging.info("  Name: %s" % i.name)
    logging.info("  Port: %s" % port)
    logging.info("  To Address: %s" % HostAddrIPv4(to_addr))
    logging.info("  To Port: %s" % to_port)


def p_segment(seg, idx, name):
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
    # PCBMarking
    logging.info("    ----------------- PCB Marking Block %s" % idx)
    logging.info("    In: %s (%s) mtu = %s" %
                 (ISD_AS(pcbms.inIA), pcbms.inIF, pcbms.inMTU))
    logging.info("    Out: %s (%s)" % (ISD_AS(pcbms.outIA), pcbms.outIF))
    logging.info("    %s" % HopOpaqueField(pcbms.hof))


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


# parse commands, query sciond, display results
args, d_isd_as, s_isd_as = init()
caddr = SCIONAddr.from_values(d_isd_as, d_ip)
print_as_viewer_info(caddr, s_isd_as)
