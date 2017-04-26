/*
 * Copyright 2016 ETH Zurich
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var C_STAT_BKGN = '99CCFF';
var MS_LIST_INTERVAL = 5000;
var MS_UDP_INTERVAL = 100;
var MS_UDP_TIMEOUT = 5000;
var UDP_PORT = "7777";
var PARA_VER = '0.1';
var PROXYMGR_EXT_ID = "akhbnlfhbdpigconahnoogmdopjcfemk";

var reqs_cnt = 0;
var resp_cnt = 0;
var reqs = [];
var udpReqMutex = false;
var echoClient = null;

// UDP request commands
var ReqCmds = {
    GET_URL_STATS : 'LOOKUP',
    GET_URLS : 'LIST',
    GET_TOPOLOGY : 'TOPO',
    GET_LOCATIONS : 'LOCATIONS',
    SET_ISD_WHITELIST : 'ISD_WHITELIST',
    GET_ISD_WHITELIST : 'GET_ISD_WHITELIST',
    GET_ISD_ENDPOINTS : 'GET_ISD_ENDPOINTS',
    CLEAR_URLS : 'CLEAR',
};

// UDP sockets...

console.debug = function() {
};

chrome.runtime.onMessageExternal.addListener(function(request, sender,
        sendResponse) {
    if (sender.id == PROXYMGR_EXT_ID) {
        handleProxyManagerRequest(request);
    }
});

chrome.runtime.onMessageExternal.addListener(function(request, sender,
        sendResponse) {
    if (sender.id == PROXYMGR_EXT_ID) {
        handleProxyManagerRequest(request);
    }
});

window.addEventListener("load", function() {
    var address = document.getElementById("address");
    var list = document.getElementById("list");
    var clear = document.getElementById("clear");

    // send a request for current proxy address
    chrome.runtime.sendMessage(PROXYMGR_EXT_ID, {
        getProxyAddress : true
    }, function(response) {
        handleProxyManagerRequest(response);
    });

    list.onclick = function(ev) {
        clearTimeout(self.listTimeoutId);
        requestListUpdate();
    };
    clear.onclick = function(ev) {
        clearFrontEnd();
        requestClear();
    };
});

function handleProxyManagerRequest(request) {
    console.log(JSON.stringify(request));
    if (request) {
        // reset state for new requests
        clearFrontEnd();
        clearTimeout(self.reqTimeoutId);
        clearInterval(self.reqIntervalId);
        clearTimeout(self.listTimeoutId);
        backgroundJobs = [];
        reqs_cnt = 0;
        resp_cnt = 0;
        reqs = [];
        udpReqMutex = false;

        if (request.proxyAddress) {
            var addr = request.proxyAddress + ":" + UDP_PORT;
            address.innerText = address.textContent = addr;
            updateConnection(addr);
        } else {
            // warn if proxy address not set
            address.innerText = address.textContent = '';
            showErrorMsg("Proxy Manager address not set.");
        }
    }
}

function createRequestManager() {
    // JS is reentrant, setInterval is needed for serialization of UDP
    self.reqIntervalId = setInterval(function() {
        // if UDP available, send next command
        if (!udpReqMutex && reqs.length > 0) {
            udpReqMutex = true;
            try {
                if (echoClient) {
                    echoClient.echo(reqs[0], function() {
                    });
                }
            } catch (e) {
                showErrorMsg(e);
                console.error("Connection error: %s", e);
            }
            // set timer to watch for dropped UDP packets
            self.reqTimeoutId = setTimeout(function() {
                if (udpReqMutex) {
                    // warn if knowledge base unavailable
                    showErrorMsg("Knowledge base response timeout.");
                    console.error('UDP request dropped! Retrying...');

                    // keep request at beginning of queue for retry
                    udpReqMutex = false;
                }
            }, MS_UDP_TIMEOUT);
        }
    }, MS_UDP_INTERVAL);
}

function updateConnection(address) {
    if (echoClient) {
        disconnect();
    } else {
        echoClient = newEchoClient(address);
        createRequestManager();
    }
}

function disconnect() {
    try {
        echoClient.disconnect();
    } catch (e) {
        console.log("Can't disconnect: %s", e);
    }
    delete echoClient;
    chrome.runtime.reload();
}

var newEchoClient = function(address) {
    var ec = new chromeNetworking.clients.echoClient();
    var hostnamePort = address.split(":");
    var hostname = hostnamePort[0];
    var port = (hostnamePort[1] || 7) | 0;
    try {
        ec.connect(hostname, port, function() {
            console.log("Connected");
            // begin setup
            requestTopology();
        });
    } catch (e) {
        showErrorMsg(e);
        console.error("Connection error: %s", e);
    }
    return ec;
};

function sendRequest(req) {
    // append version
    req.version = PARA_VER;
    // format
    var jSend = JSON.stringify(req);
    var jLen = jSend.length;
    var data = str2ab(ab2str(toBytesUInt32(jLen)) + jSend);
    // add request to end of queue
    reqs.push(data);

    // log updated queue
    var str = '[';
    for (var i = 0; i < reqs.length; i++) {
        var txtSent = ab2str(reqs[i]);
        var sent = JSON.parse(txtSent.substring(4));
        str += sent.command + ',';
    }
    str += ']';
    console.log('queue: ' + str);
}

function requestLookup() {
    var header = kBaseUrlSel.split(" ");
    sendRequest({
        command : ReqCmds.GET_URL_STATS,
        req_type : header[0],
        res_name : header[1],
        conn_id : header[2],
    });
}

function requestSetIsdWhitelist(isds) {
    if (isds == 'None' || isds == NaN) {
        return;
    }
    sendRequest({
        command : ReqCmds.SET_ISD_WHITELIST,
        isds : isds
    });
}

function requestGetIsdWhitelist() {
    sendRequest({
        command : ReqCmds.GET_ISD_WHITELIST
    });
}

function requestGetEndpoints() {
    sendRequest({
        command : ReqCmds.GET_ISD_ENDPOINTS
    });
}

function requestListUpdate() {
    sendRequest({
        command : ReqCmds.GET_URLS
    });
}

function requestTopology() {
    sendRequest({
        command : ReqCmds.GET_TOPOLOGY
    });
}

function requestLocations() {
    sendRequest({
        command : ReqCmds.GET_LOCATIONS
    });
}

function requestClear() {
    sendRequest({
        command : ReqCmds.CLEAR_URLS
    });
}

function updateUiUdpSent(ab) {
    var text = ab2str(ab);
    console.log(reqs_cnt + ' send', "'" + text + "'");
}

function updateUiUdpRecv(ab) {
    var text = ab2str(ab);
    console.log(resp_cnt + ' recv', "'" + text + "'");
    resp_cnt++;

    var jLen = fromBytesUInt32(str2ab(text.substring(0, 4)));
    var jData = text.substring(4);
    // check length
    if (jLen != jData.length) {
        showErrorMsg("Invalid response length.");
        console.error("Lengths not equal, discarding: " + jLen + ","
                + jData.length);
        return;
    }
    if (reqs.length == 0) {
        showErrorMsg("Unexpected response, queue empty.");
        return;
    }

    var txtSent = ab2str(reqs[0]);
    var sent = JSON.parse(txtSent.substring(4));

    // validate command for format
    try {
        var res = JSON.parse(jData);
        var handled = processCmdResp(sent.command, res);

        // after processing remove request from beginning of queue
        reqs.shift();

        if (!handled) {
            showErrorMsg("Malformed response for " + sent.command + " command.");
            return;
        }

        // clear any errors
        hideErrorMsg();

    } catch (e) {
        if (e instanceof SyntaxError) {
            showErrorMsg("Malformed JSON repsonse.");
            console.error("JSON parse error: %s", e);
        } else if (e instanceof TypeError) {
            showErrorMsg("Missing parameter in response.");
            console.error("Missing parameter: %s", e);
        } else {
            showErrorMsg("Unexpected error.");
            throw e;
        }
    } finally {
        // always release mutex in case of error
        clearTimeout(self.reqTimeoutId);
        udpReqMutex = false;

        reqs_cnt++;
    }
}

function processCmdResp(cmd, res) {
    switch (cmd) {
    case ReqCmds.GET_ISD_WHITELIST:
        return handleRespGetIsdWhitelist(res);
    case ReqCmds.GET_TOPOLOGY:
        return handleRespTopology(res);
    case ReqCmds.GET_URLS:
        return handleRespList(res);
    case ReqCmds.GET_URL_STATS:
        return handleRespLookup(res);
    case ReqCmds.GET_ISD_ENDPOINTS:
        return handleRespGetIsdEndpoints(res);
    case ReqCmds.SET_ISD_WHITELIST:
        return handleRespSetIsdWhitelist(res);
    case ReqCmds.GET_LOCATIONS:
        return handleRespLocations(res);
    case ReqCmds.CLEAR_URLS:
        return handleRespClear(res);
    }
    return false;
}

/**
 * Report if all locations match stated topology.
 */
function validTopoLocations() {
    var isdAs;
    for (isdAs in self.jLoc) {
        var found = false;
        for (var p = 0; p < self.jTopo.length; p++) {
            if (isdAs == self.jTopo[p].a || isdAs == self.jTopo[p].b) {
                found = true;
                continue;
            }
        }
        if (!found) {
            console.error("LOCATION not found in TOPO, ", isdAs);
            return false;
        }
    }
    return true;
}

/**
 * Report if both end points match stated topology.
 */
function validTopoEndpoints() {
    var foundSrc = foundDst = false;
    var src = self.jSrc[0] + "-" + self.jSrc[1];
    var dst = self.jDst[0] + "-" + self.jDst[1];
    for (var p = 0; p < self.jTopo.length; p++) {
        if (src == self.jTopo[p].a || src == self.jTopo[p].b) {
            foundSrc = true;
        }
        if (dst == self.jTopo[p].a || dst == self.jTopo[p].b) {
            foundDst = true;
        }
    }
    if (!foundSrc || !foundDst) {
        console.error("ENDPOINT not found in TOPO, ", src + ", " + dst);
        return false;
    }
    return true;
}

function validTopoWhitelist() {
}

/**
 * Report if reported path interfaces match stated topology.
 */
function validTopoLookup(res) {
    for (var i = 0; i < res.if_lists.length; i++) {
        for (var f = 0; f < res.if_lists[i].length; f++) {

            var iFace = res.if_lists[i][f].ISD + "-" + res.if_lists[i][f].AS;
            var found = false;
            for (var p = 0; p < self.jTopo.length; p++) {
                if (iFace == self.jTopo[p].a || iFace == self.jTopo[p].b) {
                    found = true;
                    continue;
                }
            }
            if (!found) {
                console.error("LOOKUP interface not found in TOPO, ", iFace);
                return false;
            }
        }
    }
    return true;
}

function handleRespTopology(res) {
    if (Array.isArray(res) && res[0].hasOwnProperty("a")
            && res[0].hasOwnProperty("b") && res[0].hasOwnProperty("ltype")) {
        self.jTopo = res;

        // parse topology for valid ISDs
        self.isds = [];
        for (var l = 0; l < self.jTopo.length; l++) {
            var iface = self.jTopo[l].a.split("-");
            var isd = parseInt(iface[0]);
            if (self.isds.indexOf(isd) === -1) {
                self.isds.push(isd);
            }
        }
        self.isds.sort();

        // populate ISD checkbox list
        populateIsdCheckboxes();

        var rect = document.getElementById("TopologyGraph")
                .getBoundingClientRect();
        var width = rect.width;
        var height = rect.height;
        if (height < 600) {
            height = 600;
        }
        drawTopology(self.jTopo, width, height);

        // locations should load only after topology has arrived
        requestLocations();
        return true;
    } else {
        return false;
    }
}

function populateIsdCheckboxes() {
    var cbAllIsd = document.getElementById("ckbCheckAllIsd");
    cbAllIsd.disabled = true;
    var checkBoxesIsd = document.getElementById("checkBoxesIsd");
    if (checkBoxesIsd.children.length == 0) {
        for (var i = 0; i < self.isds.length; i++) {
            var isd = self.isds[i];
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "checkBoxClass";
            cb.name = "cbIsd";
            cb.id = "ckbIsd" + isd;
            cb.value = isd;
            cb.disabled = true; // disable until src and dst known
            cb.onchange = function() {
                handleIsdWhitelistCheckedChange();
            };

            var label = document.createElement('label')
            label.htmlFor = "id";
            label.appendChild(document.createTextNode(isd));

            checkBoxesIsd.appendChild(cb);
            checkBoxesIsd.appendChild(label);
        }
    }
}

function handleRespGetIsdEndpoints(res) {
    if (!Array.isArray(res) && res.hasOwnProperty("source_ISD_AS")
            && res.hasOwnProperty("target_ISD_AS")) {

        // Update bubble with src and dst now known
        self.jSrc = res.source_ISD_AS;
        self.jDst = res.target_ISD_AS;

        // check topoplogy for valid end points
        if (validTopoEndpoints()) {
            if (validTopoLocations()) {
                updateMapAsMarkers(self.jSrc[0] + "-" + self.jSrc[1],
                        self.jDst[0] + "-" + self.jDst[1]);
            }
            // gray out only src and dest checkboxes
            var isAnyEnabled = false;
            var cbLen = document.getElementsByName('cbIsd').length;
            for (var i = 0; i < cbLen; i++) {
                var cb = document.getElementsByName('cbIsd')[i];
                var id = "ckbIsd" + cb.value;
                if (cb.value == self.jSrc[0] || cb.value == self.jDst[0]) {
                    document.getElementById(id).disabled = true;
                    document.getElementById(id).checked = true;
                } else {
                    // re enable when src and dst are known
                    document.getElementById(id).disabled = false;
                    isAnyEnabled = true;
                }
            }
            // if all ISDs grey, no change wlist cmd
            var cbAllIsd = document.getElementById("ckbCheckAllIsd");
            cbAllIsd.disabled = !isAnyEnabled;

            topoSetup({
                "source" : self.jSrc[0] + "-" + self.jSrc[1],
                "destination" : self.jDst[0] + "-" + self.jDst[1]
            });
        }

        requestGetIsdWhitelist();
        return true;
    } else {
        return false;
    }
}

function handleRespLocations(res) {
    if (!Array.isArray(res)) {
        self.jLoc = res;

        // render blank map on load
        initMap(self.isds);

        // check topoplogy for valid locations
        if (validTopoLocations()) {
            // Show AS and ISD numbers on the map on the countries
            updateMapAsMarkers();
            updateMapAsLinks();
        }
        // make requests only after map is loaded
        requestGetEndpoints();
        return true;
    } else {
        return false;
    }
}

function handleRespList(res) {
    if (Array.isArray(res)) {
        // add elements from list to accordion
        res.forEach(function(entry) {
            addUrlToAccordion(entry);
        });
        sortAccordion();

        // begin list interval
        self.listTimeoutId = setTimeout(function() {
            requestListUpdate();
        }, MS_LIST_INTERVAL);
        return true;
    } else {
        return false;
    }
}

function handleRespLookup(res) {
    if (!Array.isArray(res) && res.hasOwnProperty("sent_packets")
            && res.hasOwnProperty("received_packets")
            && res.hasOwnProperty("acked_packets")
            && res.hasOwnProperty("sent_packets") && res.hasOwnProperty("rtts")
            && res.hasOwnProperty("if_counts")
            && res.hasOwnProperty("if_lists")) {
        // render socket stats data for url expanded body
        var head = [];
        var lrs = [];
        var rtts = [];
        for (var i = 0; i < res.loss_rates.length; i++) {
            head.push("Path " + (i + 1));
            lrs.push(res.loss_rates[i].toFixed(2));
            rtts.push((res.rtts[i] / 1000).toFixed(2));
        }
        var arrPcts = [
                rStat('Packets Sent', (res.sent_packets ? res.sent_packets
                        : '-')),
                rStat('Packets Received',
                        (res.received_packets ? res.received_packets : '-')),
                rStat('Packets Acked', (res.acked_packets ? res.acked_packets
                        : '-')), rStat('RTTs (ms)', (rtts ? rtts : '-')),
                rStat('Loss Rates', (lrs ? lrs : '-')), ];
        backgroundJobs = arrPcts.concat(getInterfaceListRows(res));
        renderStatsHeader(kBaseIndexSel, rStat("All Paths", head));
        renderStatsBody(kBaseIndexSel);

        // show the links between the countries on the map, default to last path
        document.getElementsByName('radioPath')[res.if_lists.length].checked = true;
        if (validTopoLookup(res)) {
            handlePathSelection(res, res.if_lists.length - 1);

            // Allow user selection of path in the accordion
            var rLen = document.getElementsByName('radioPath').length;
            for (var i = 0; i < rLen; i++) {
                document.getElementsByName('radioPath')[i].onclick = function() {
                    handlePathSelection(res, parseInt(this.value));
                }
            }
        }
        return true;
    } else {
        return false;
    }
}

function handlePathSelection(res, path) {
    if (validTopoLocations(res)) {
        updateMapAsLinks(res, path);
    }
    // 160315 yskim added
    restorePath();
    drawPath(res, path);
}

function handleRespSetIsdWhitelist(res) {
    if (!Array.isArray(res) && res.hasOwnProperty("STATUS")) {
        if (res.STATUS == 'OK') {
            requestClear();
        } else {
            // handle error case when setting ISD fails
            showErrorMsg("ISD_WHITELIST = " + res.STATUS);
        }
        return true;
    } else {
        return false;
    }
}

function clearFrontEnd() {
    clearTimeout(self.listTimeoutId);
    removeAllFromAccordion();
    if (validTopoLocations(self.jLoc)) {
        updateMapAsLinks();
    }
    restorePath();
}

function handleRespGetIsdWhitelist(res) {
    if (Array.isArray(res) && (res.every(isNumber) || res.length == 0)) {
        self.jWhiteList = res;
        // empty list means all in use
        var isds = self.isds;
        if (self.jWhiteList.length != 0) {
            isds = self.jWhiteList;
        }
        // set checkboxes
        for (var i = 0; i < self.isds.length; i++) {
            var isd = self.isds[i];
            var id = "ckbIsd" + isd;
            document.getElementById(id).checked = (isds.indexOf(isd) > -1);
        }
        if (isds.length == self.isds.length) {
            // when all isds checked, must sure 'all' is as well
            var cbAllIsd = document.getElementById("ckbCheckAllIsd");
            cbAllIsd.checked = true;
        }
        // change ISDs on map
        updateMapIsdRegions(isds);

        // close setup phase
        clearTimeout(self.listTimeoutId);
        requestListUpdate();
        return true;
    } else {
        return false;
    }
}

function handleRespClear(res) {
    if (!Array.isArray(res) && res.hasOwnProperty("STATUS")) {
        if (res.STATUS == 'OK') {
            clearTimeout(self.listTimeoutId);
            requestListUpdate();
        } else {
            // handle error case when clearing urls fails
            showErrorMsg("CLEAR = " + res.STATUS);
        }
        return true;
    } else {
        return false;
    }
}

function handleIsdWhitelistCheckedChange() {
    var cbLen = document.getElementsByName('cbIsd').length;
    var isds = [];
    for (var i = 0; i < cbLen; i++) {
        var cb = document.getElementsByName('cbIsd')[i];
        if (cb.checked) {
            isds.push(parseInt(cb.value));
        }
    }
    updateMapIsdRegions(isds);

    // when all isds checked, must sure 'all' is as well
    var cbAllIsd = document.getElementById("ckbCheckAllIsd");
    if (isds.length == cbLen) {
        // when all are checked send clear whitelist cmd
        isds = [];
        cbAllIsd.checked = true;
    } else {
        cbAllIsd.checked = false;
    }
    // on set ISD make sure the clean accordion, send clear
    clearFrontEnd();
    requestSetIsdWhitelist(isds);
}

function showErrorMsg(msg) {
    document.getElementById('error_msg').innerText = msg;
    console.error(msg);
}

function hideErrorMsg() {
    document.getElementById('error_msg').innerText = '';
}

function ab2str(ab) {
    return String.fromCharCode.apply(null, new Uint8Array(ab));
}

function str2ab(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0; i < str.length; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

function toBytesUInt32(num) {
    var ab = new ArrayBuffer(4);
    var view = new DataView(ab);
    view.setInt32(0, num, false);
    return ab;
}

function fromBytesUInt32(ab) {
    var view = new DataView(ab);
    return view.getInt32(0, false);
}

function isNumber(element, index, array) {
    return isFinite(element);
}

// JQuery...

$(function() {
    // initialize ISD checkboxes
    $('#ckbCheckAllIsd').change(function() {
        handleIsdWhitelistCheckedChange();
    });
});

// wait for DOM load
$(document).ready(
        function() {

            initResizeablePanels();

            // check/uncheck all ISDs that are enabled
            $("#ckbCheckAllIsd").click(
                    function() {
                        $(".checkBoxClass:not(:disabled)").prop('checked',
                                $(this).prop('checked'));
                    });

            // When location.hash matches one of the links, use
            // that as the active tab. When no match is found, use
            // the first link as the initial active tab.
            $('ul.tabs').each(
                    function() {
                        var $active, $content, $links = $(this).find('a');

                        $active = $($links.filter('[href="' + location.hash
                                + '"]')[0]
                                || $links[0]);
                        $active.addClass('active');
                        $content = $($active[0].hash);

                        // hide inactive content
                        $links.not($active).each(function() {
                            $(this.hash).hide();
                        });

                        $(this).on('click', 'a', function(e) {
                            // deactivate old tab
                            $active.removeClass('active');
                            $content.hide();

                            // update
                            $active = $(this);
                            $content = $(this.hash);

                            // make active
                            $active.addClass('active');
                            $content.show();

                            // ignore default click
                            e.preventDefault();
                        });
                    });
        });

function initResizeablePanels() {
    // init resizable panels
    var bheight = $("#divResizable").height();
    var nbpanels = $(".vpanel").size();
    var pad = 0;// 2.5;
    $(".vpanel").height((bheight / nbpanels) - (nbpanels * pad - 2 * pad));
    $(".vpanel").resizable(
            {
                handles : {
                    's' : '#handle'
                },
                minHeight : 100,
                resize : function(event, ui) {
                    var curheight = ui.size.height;
                    // set the content panel height
                    $(".vpanel").height(
                            ((bheight - curheight + pad) / (nbpanels - 1))
                                    - ((nbpanels - 1) * pad));
                    $(this).height(curheight);

                    // now, reset topo window
                    resize_topology();
                }
            });
}

$(window).resize(function() {
    initResizeablePanels();
});
