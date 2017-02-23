#!/usr/bin/python3
# Copyright 2016 ETH Zurich
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

# Stdlib
import argparse

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


s_isd_as = ISD_AS("1-18")
s_ip = haddr_parse(1, "127.1.18.1")
c_isd_as = ISD_AS("2-26")
c_ip = haddr_parse(1, "127.2.26.1")

parser = argparse.ArgumentParser(description='SCION AS Path Viewer requires source and destination ISD-ASes to analyze.')
# required
parser.add_argument('src_isdas', type=str, help='ISD-AS source.')
parser.add_argument('dst_isdas', type=str, help='ISD-AS destination.')
# optional
parser.add_argument('-t', action="store_true", default=False, help='display destination AS topology')
parser.add_argument('-p', action="store_true", default=False, help='display announced paths')
parser.add_argument('-s', action="store_true", default=False, help='display available segments overview')
parser.add_argument('-u', type=int, help='display # up segment detail (0-based)')
parser.add_argument('-d', type=int, help='display # down segment detail (0-based)')
parser.add_argument('-c', type=int, help='display # core segment detail (0-based)')
args = None
args = parser.parse_args()

s_isd_as = ISD_AS(args.src_isdas)
c_isd_as = ISD_AS(args.dst_isdas)

print("")
print("SCION AS Viewer for path...")
print("(src) %s =======================> %s (dst)" % (args.src_isdas, args.dst_isdas))

def get_path_info(myaddr, dst_isd_as):

    addr = haddr_parse("IPV4", "127.%s.%s.254" % (c_isd_as._isd, c_isd_as._as))
    conf_dir = "%s/ISD%s/AS%s/endhost" % (GEN_PATH, c_isd_as._isd, c_isd_as._as)
    sd = SCIONDaemon.start(conf_dir, addr)
        
    if args.t:
        t = sd.topology
        print("")
        print("----------------- AS TOPOLOGY: %s" % t.isd_as)
        print("is_core_as: %s" % t.is_core_as)
        print("mtu: %s" % t.mtu)
        for s in t.beacon_servers:
            p_server_element(s, "BEACON")
        for s in t.certificate_servers:
            p_server_element(s, "CERTIFICATE")
        for s in t.path_servers:
            p_server_element(s, "PATH")
        for s in t.sibra_servers:
            p_server_element(s, "SIBRA")    
        for s in t.parent_border_routers:
            p_router_element(s, "PARENT BORDER")
        for s in t.child_border_routers:
            p_router_element(s, "CHILD BORDER")
        for s in t.peer_border_routers:
            p_router_element(s, "PEER BORDER")
        for s in t.zookeepers:
            print("----------------- ZOOKEEPER:")
            print("%s" % s)

    if args.p:
        paths, error = sd.get_paths(s_isd_as)
        if error != 0:
            print("Error: %s" % error)
        i = 0
        # enumerate all paths
        for path in paths:
            print("")
            print("----------------- PATH %s" % (i + 1))
            print("MTU: %s" % path.p.mtu)
            print("Interfaces Len: %s" % len(path.p.interfaces))
    
            # enumerate path interfaces
            for interface in path.p.interfaces:       
                isd_as = ISD_AS(interface.isdas)
                link = interface.ifID
                try:
                    addr = sd.ifid2br[link].addr
                except KeyError:
                    addr = ''
                print("%s-%s (%s) %s" % (isd_as._isd, isd_as._as, link, addr))
            
            i += 1
        
    csegs = sd.core_segments()
    dsegs = sd.down_segments()
    usegs = sd.up_segments()
#     seg_summary = False
#     if args.s:
#         seg_summary = True

    # enumerate core segments
    if args.s:
        csegidx = 0
        for cseg in csegs:
            print("CORE SEGMENT %s" % csegidx)
#             if seg_summary:
#                 print("CORE SEGMENT %s" % csegidx)
#             else:
            p_segment(cseg, csegidx, "CORE")
            csegidx += 1

    # enumerate down segments
    if args.d or args.s:
        dsegidx = 0
        for dseg in dsegs:
            p_segment(dseg, dsegidx, "DOWN")
            dsegidx += 1

    # enumerate up segments
    if args.u or args.s:
        usegidx = 0
        for useg in usegs:
            p_segment(useg, usegidx, "UP")
            usegidx += 1

    print("")


def p_server_element(s, name):
    print("----------------- %s SERVER:" % name)
    print("Address: %s" % HostAddrIPv4(s.addr))
    print("Name: %s" % s.name)
    print("Port: %s" % s.port)

def p_router_element(s, name):
    print("----------------- %s ROUTER:" % name)
    print("Address: %s" % HostAddrIPv4(s.addr))
    print("Name: %s" % s.name)
    print("Port: %s" % s.port)
    p_interface_element(s.interface)
        
def p_interface_element(i):
    print("  ----------------- INTERFACE:")
    print("  Address: %s" % HostAddrIPv4(i.addr))
    print("  Bandwidth: %s" % i.bandwidth)
    print("  Interface ID: %s" % i.if_id)
    print("  ISD AS: %s" % i.isd_as)
    print("  Link Type: %s" % i.link_type)
    print("  MTU: %s" % i.mtu)
    print("  Name: %s" % i.name)
    print("  Port: %s" % i.port)
    print("  UDP Port: %s" % i.udp_port)
    print("  To Address: %s" % HostAddrIPv4(i.to_addr))
    print("  To Interface ID: %s" % i.to_if_id)
    print("  To UDP Port: %s" % i.to_udp_port)

def p_segment(seg, idx, name):
    print("")
    print("----------------- %s SEGMENT %s" % (name, idx + 1))        
    print("Expiration Time: %s" % seg._min_exp)
    p = seg.p
    
    # InfoOpaqueField
    print("%s" % InfoOpaqueField(p.info))
    # PathSegment
    print("Interface ID: %s" % p.ifID)
    print("SIBRA Ext Up: %s" % p.exts.sibra.up)
    asmsidx = 0
    for asms in p.asms:
        p_as_marking(asms, asmsidx)
        asmsidx += 1

def p_as_marking(asms, idx):
    # ASMarking
    print("  ----------------- AS Marking Block %s" % (idx + 1))
    print("  AS: %s" % ISD_AS(asms.isdas))
    print("  TRC: v%s" % asms.trcVer)
    print("  Cert: v%s" % asms.certVer)
    print("  Interface ID Size: %s" % asms.ifIDSize)
    print("  Hashtree Root: %s" % asms.hashTreeRoot.hex())
    print("  Signature: %s" % asms.sig.hex())
    print("  AS MTU: %s" % asms.mtu)
    print("  Chain: %s" % asms.chain.hex())
    pcbmsidx = 0
    for pcbms in asms.pcbms:
        p_pcb_marking(pcbms, pcbmsidx)
        pcbmsidx += 1

def p_pcb_marking(pcbms, idx):
    # PCBMarking
    print("    ----------------- PCB Marking Block %s" % (idx + 1))
    print("    In: %s (%s)" % (ISD_AS(pcbms.inIA), pcbms.inIF))
    print("    Out: %s (%s)" % (ISD_AS(pcbms.outIA), pcbms.outIF))
    print("    %s" % HopOpaqueField(pcbms.hof))


caddr = SCIONAddr.from_values(c_isd_as, c_ip)
path_info = get_path_info(caddr, s_isd_as)

