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
var MS_SETUP_INTERVAL = 1000;
var MS_LIST_INTERVAL = 5000;
var UDP_ADDR = "127.0.0.1:7777";
var PARA_VER = '0.1';

var kBaseIndex = 0;
var kBaseIndexSel = 0;
var kBaseUrlSel = null;
var backgroundJobs = [];

window.onload = function() {
}

// D3 simple table...

var rStat = function(name, arr) {
    var row = {};
    row.name = name;
    for (var i = 0; i < arr.length; i++) {
        row["path" + i] = arr[i];
    }
    return row;
};

function renderStatsHeader(index, hRow) {
    var thead = d3.select(".urlStatsWidget").select('[id="' + index + '"]')
            .select('thead');
    var rows = thead.selectAll("tr").data([ hRow ], function(d) {
        return d.name;
    });
    rows.enter().append("tr");
    rows.order();
    var cells = rows.selectAll("th").data(function(row) {
        var cols = [];

        cols.push({
            column : '-1',
            value : row.name
        });
        var i = 0;
        while (row.hasOwnProperty("path" + i)) {
            cols.push({
                column : i,
                value : row["path" + i]
            });
            i++;
        }
        return cols;
    });
    // Create accurate list of paths radio buttons
    cells.enter().append("th").append('label').html(function(d) {
        return d.value;
    }).append('input').attr('name', 'radioPath').attr('type', 'radio').attr(
            'value', function(d) {
                return (d.column).toString();
            });
    cells.exit().remove();
    rows.exit().remove();
}

function renderStatsBody(index) {
    var tbody = d3.select(".urlStatsWidget").select('[id="' + index + '"]')
            .select('tbody');
    var rows = tbody.selectAll("tr").data(backgroundJobs, function(d) {
        return d.name;
    });
    rows.enter().append("tr");
    rows.order();
    var cells = rows.selectAll("td").data(function(row) {
        var cols = [];
        cols.push({
            column : 'Name',
            value : row.name
        });
        var i = 0;
        while (row.hasOwnProperty("path" + i)) {
            cols.push({
                column : i,
                value : row["path" + i]
            });
            i++;
        }
        return cols;
    });
    cells.enter().append("td");
    cells.text(function(d) {
        return d.value;
    });
    cells.exit().remove();
    rows.exit().remove();
}

// UDP sockets...

console.debug = function() {
};

var echoClient = null;

window.addEventListener("load", function() {
    var connect = document.getElementById("connect");
    var get_urls = document.getElementById("get_urls");
    var clear_urls = document.getElementById("clear_urls");
    var resume = document.getElementById("resume");

    echoClient = newEchoClient(UDP_ADDR);
    connect.onclick = function(ev) {
        echoClient.disconnect();
        echoClient = newEchoClient(UDP_ADDR);
    };
    get_urls.onclick = function(ev) {
        requestGetUrls();
    };
    clear_urls.onclick = function(ev) {
        requestClearUrls();
        removeAllFromAccordion();
    };
    resume.onclick = function(ev) {
        // on click Resume List, set the interval to poll the
        // list again.
        document.getElementById("divResume").style.display = "none";
        refreshSocketData();
        self.listIntervalId = setInterval(function() {
            refreshSocketData();
        }, MS_LIST_INTERVAL);
    };
});

var newEchoClient = function(address) {
    var ec = new chromeNetworking.clients.echoClient();
    ec.sender = attachSend(ec);
    var hostnamePort = address.split(":");
    var hostname = hostnamePort[0];
    var port = (hostnamePort[1] || 7) | 0;
    ec.connect(hostname, port, function() {
        console.log("Connected");

        clearInterval(self.listIntervalId);
        refreshSocketData();
        self.listIntervalId = setInterval(function() {
            refreshSocketData();
        }, MS_SETUP_INTERVAL);
        // keep load interval tight until init complete
    });
    return ec;
};

function refreshSocketData() {
    if (self.jTopo == null) {
        requestGetTopology();
    }
    if (self.jTopo != null && self.jLoc == null) {
        // locations should load only after topology has arrived
        requestGetLocations();
    }
    if (self.jLoc != null) {
        requestGetUrls();
    }
}

function sendRequest(jSend) {
    var jLen = jSend.length;
    var data = str2ab(ab2str(toBytesUInt32(jLen)) + jSend);
    echoClient.echo(data, function() {
    });
}

var attachSend = function(client) {
    return function(e) {
        var header = kBaseUrlSel.split(" ");
        var req = {};
        req.version = PARA_VER;
        req.command = 'LOOKUP';
        req.req_type = header[0];
        req.res_name = header[1];
        var jSend = JSON.stringify(req);
        sendRequest(jSend);
    };
};

function requestSetIsdWhitelist(isds) {
    var req = {};
    req.version = PARA_VER;
    req.command = 'ISD_WHITELIST';
    req.isds = isds;
    if (isds == 'None' || req.isds == NaN) {
        return;
    }
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestGetIsdWhitelist() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'GET_ISD_WHITELIST';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestGetEndpoints() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'GET_ISD_ENDPOINTS';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestGetUrls() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'LIST';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);

    // TODO (mwfarb): warn if knowledge base unavailable
}

function requestGetTopology() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'TOPO';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestGetLocations() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'LOCATIONS';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestClearUrls() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'LIST_CLEAR';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);

    // TODO: clear urls
}

function updateUiUdpSent(ab) {
    var text = ab2str(ab);
    console.log('send', "'" + text + "'");
}

function updateUiUdpRecv(ab) {
    var text = ab2str(ab);
    console.log('receive', "'" + text + "'");

    var jLen = fromBytesUInt32(str2ab(text.substring(0, 4)));
    var jData = text.substring(4);
    // check length
    if (jLen != jData.length) {
        console.log("Lengths not equal, discarding: " + jLen + ","
                + jData.length);
        return;
    }

    // TODO (mwfarb): since js is reentrant, setTimeout() may be needed for
    // serialization of UDP messages, for now detect resp by content

    try {
        var res = JSON.parse(jData);
        if (Array.isArray(res)) {
            if (res.every(isNumber) || res.length == 0) {
                // isd get whitelist
                handleRespGetIsdWhitelist(res);
            } else if (res[0].hasOwnProperty("a") && res[0].hasOwnProperty("b")
                    && res[0].hasOwnProperty("ltype")) {
                // topology
                handleRespGetTopology(res);
            } else {
                // url list
                handleRespGetUrls(res);
            }
        } else {
            if (res.hasOwnProperty("sent_packets")) {
                // lookup
                handleRespGetUrlStats(res);
            } else if (res.hasOwnProperty("source_ISD_AS")
                    && res.hasOwnProperty("target_ISD_AS")) {
                // get isd endpoints
                handleRespGetIsdEndpoints(res);
            } else if (res.hasOwnProperty("STATUS")) {
                // isd set whitelist
                handleRespSetIsdWhitelist(res);
            } else {
                // locations
                handleRespGetLocations(res);
            }
        }
    } catch (e) {
        if (e instanceof SyntaxError) {
            console.log("JSON parse error: %s", e);
        } else if (e instanceof TypeError) {
            console.log("Missing parameter: %s", e);
        } else {
            throw e;
        }
    }
}

function handleRespGetTopology(res) {
    // store topology locally for later rendering
    if (typeof self.jTopo === "undefined") {
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

        var width = $(window).width(), height = $(window).height();
        drawTopology(self.jTopo, width, height);
    }
}

function handleRespGetIsdEndpoints(res) {
    // Update bubble with src and dst now known
    var src = res.source_ISD_AS;
    var dst = res.target_ISD_AS;
    map.bubbles(updateMapIsdAsBubbles(src[0] + "-" + src[1], dst[0] + "-"
            + dst[1]));

    // gray out only src and dest checkboxes
    var isAnyEnabled = false;
    var cbLen = document.getElementsByName('cbIsd').length;
    for (var i = 0; i < cbLen; i++) {
        var cb = document.getElementsByName('cbIsd')[i];
        var id = "ckbIsd" + cb.value;
        if (cb.value == src[0] || cb.value == dst[0]) {
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
}

function handleRespGetLocations(res) {
    // store locations locally for later rendering
    if (typeof self.jLoc === "undefined") {
        self.jLoc = res;

        // set interval to be more relaxed
        clearInterval(self.listIntervalId);
        refreshSocketData();
        self.listIntervalId = setInterval(function() {
            refreshSocketData();
        }, MS_LIST_INTERVAL);

        // render blank map on load
        initMap(getIsdFillColors(self.isds));

        // Show AS and ISD numbers on the map on the countries
        map.bubbles(updateMapIsdAsBubbles());
        map.arc(updateMapIsdAsArc());

        // make requests only after map is loaded
        requestGetEndpoints();
        requestGetIsdWhitelist();
    }
}

function handleRespGetUrls(res) {
    // add elements from list to accordion
    res.forEach(function(entry) {
        addUrlToAccordion(entry);
    });
    sortAccordion();
}

function handleRespGetUrlStats(res) {
    // render socket stats data for url expanded body
    var head = [];
    var lrs = [];
    for (var i = 0; i < res.loss_rates.length; i++) {
        head.push("Path " + (i + 1));
        lrs.push(res.loss_rates[i].toFixed(2));
    }
    var arrPcts = [
            rStat('Packets Sent', (res.sent_packets ? res.sent_packets : '-')),
            rStat('Packets Received',
                    (res.received_packets ? res.received_packets : '-')),
            rStat('Packets Acked',
                    (res.acked_packets ? res.acked_packets : '-')),
            rStat('RTTs', (res.rtts ? res.rtts : '-')),
            rStat('Loss Rates', (lrs ? lrs : '-')), ];
    backgroundJobs = arrPcts.concat(getInterfaceListRows(res));
    renderStatsHeader(kBaseIndexSel, rStat("All Paths", head));
    renderStatsBody(kBaseIndexSel);

    // show the links between the countries on the map, default to last path
    document.getElementsByName('radioPath')[res.if_lists.length].checked = true;
    handlePathSelection(res, res.if_lists.length - 1);

    // Allow user selection of path in the accordion
    var rLen = document.getElementsByName('radioPath').length;
    for (var i = 0; i < rLen; i++) {
        document.getElementsByName('radioPath')[i].onclick = function() {
            handlePathSelection(res, parseInt(this.value));
        }
    }
}

function handlePathSelection(res, path) {
    map.arc(updateMapIsdAsArc(res, path));

    // 160315 yskim added
    restorePath();
    drawPath(res, path);
}

function handleRespSetIsdWhitelist(res) {
    // TODO (mwfarb): handle error case when setting ISD fails

    if (res.STATUS == 'OK') {
        // on set ISD make sure the clean accordion, stop list
        clearInterval(self.listIntervalId);
        document.getElementById("divStatsWidget").style.display = "none";
        document.getElementById("divResume").style.display = "block";
        map.arc(updateMapIsdAsArc());
        restorePath();
    }
}

function handleRespGetIsdWhitelist(res) {
    if (res.length == 0) {
        // empty list means all in use
        var isds = self.isds;
    } else {
        var isds = res;
    }
    // set checkboxes
    for (var i = 0; i < self.isds.length; i++) {
        var isd = self.isds[i];
        var id = "ckbIsd" + isd;
        if (isds.indexOf(isd) > -1) {
            document.getElementById(id).checked = true;
        } else {
            document.getElementById(id).checked = false;
        }
    }
    if (isds.length == self.isds.length) {
        // when all isds checked, must sure 'all' is as well
        var cbAllIsd = document.getElementById("ckbCheckAllIsd");
        cbAllIsd.checked = true;
    }
    // change ISDs on map
    map.updateChoropleth(updateMapIsdSelChoropleth(isds), {
        reset : true
    });
}

function handleRespClearUrls(res) {
    // TODO (mwfarb): handle error case when clearing urls fails, likely only a
    // persistant warning for inaccuracy and possible instruction to try
    // manually clicking 'Clear Stats'.
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
    map.updateChoropleth(updateMapIsdSelChoropleth(isds), {
        reset : true
    });

    // when all isds checked, must sure 'all' is as well
    var cbAllIsd = document.getElementById("ckbCheckAllIsd");
    if (isds.length == cbLen) {
        // when all are checked send clear whitelist cmd
        isds = [];
        cbAllIsd.checked = true;
    } else {
        cbAllIsd.checked = false;
    }
    requestSetIsdWhitelist(isds);
    requestClearUrls();
}

function getInterfaceListRows(res) {
    var rows = [];
    var ifNum = 0;
    var found = true;
    var max_count = Math.max.apply(null, res.if_counts);
    do {
        var row = [];
        for (var i = 0; i < res.if_lists.length; i++) {
            if (ifNum < res.if_counts[i]) {
                var ifRes = res.if_lists[i][ifNum];
                row.push(ifRes.ISD + '-' + ifRes.AS + ' (' + ifRes.IFID + ')');
            } else {
                row.push('-');
            }
        }
        rows.push(rStat('Interface ' + (ifNum + 1), (row ? row : '-')));
        ifNum++;
    } while (ifNum < max_count);
    return rows;
}

function sortAccordion() {
    // Get an array of jQuery objects containing each h3 and the div
    // that follows it
    var entries = $.map($(".urlStatsWidget").children("h3").get(), function(
            entry) {
        var $entry = $(entry);
        return $entry.add($entry.next());
    });

    // Sort the array by the h3's text
    entries.sort(function(a, b) {
        return a.filter("h3").text().localeCompare(b.filter("h3").text());
    });

    // Put them in the right order in the container
    $.each(entries, function() {
        this.detach().appendTo($(".urlStatsWidget"));
    });
}

function addUrlToAccordion(httpReq) {
    var header = httpReq[0] + " " + httpReq[1];
    $(function() {
        // determine which elements are new
        var foundin = $('body:contains("' + header + '")');
        if (!foundin.length) {
            // add urls to widget
            var newDiv = "<h3>" + httpReq[0] + " " + httpReq[1]
                    + "</h3><div id='" + kBaseIndex + "' >"
                    + "<table><thead></thead><tbody></tbody></table></div>";
            $(".urlStatsWidget").append(newDiv)
            $(".urlStatsWidget").accordion("refresh");
            kBaseIndex++;
        }
    });
}

function removeAllFromAccordion() {
    // clear the contents
    $(".urlStatsWidget").empty();
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
    // initialize URL accordion widget
    $(".urlStatsWidget").accordion({
        autoHeight : false,
        collapsible : true,
        active : false,
        heightStyle : "content",
        animate : 300,
        activate : function(event, ui) {
        }
    }).sortable({
        axis : "y",
        handle : "h3",
        sorting : true,
        stop : function() {
            stop = true;
        }
    });
    $(".urlStatsWidget").on("accordionactivate", function(event, ui) {
        if (ui.newHeader.length && ui.newPanel.length) {
            // accordion is expanding, udp lookup
            kBaseUrlSel = ui.newHeader[0].innerText;
            kBaseIndexSel = ui.newPanel.attr('id');
            console.log("activate init event: " + kBaseIndexSel);
            if (echoClient != null) {
                echoClient.sender();
            }
        } else {
            // when closing accordion clean path selction, keep bubbles
            map.arc(updateMapIsdAsArc());
            restorePath();
        }
    });
    $(".toEnable").each(function() {
        $(this).removeClass("ui-state-disabled");
    });
    $(".toDisable").each(function() {
        $(this).addClass("ui-state-disabled");
    });

    // TODO (mwfarb): change color of list items when disabled

    // initialize ISD checkboxes
    $('#ckbCheckAllIsd').change(function() {
        handleIsdWhitelistCheckedChange();
    });
});
$(window).resize(function() {
    // give topology more room
    if (typeof self.jTopo !== "undefined") {
        var width = $(window).width(), height = $(window).height();
        drawTopology(self.jTopo, width, height);
    }
});
// wait for DOM load
$(document).ready(
        function() {
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
