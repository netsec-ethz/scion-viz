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
var C_MAP_COUNDEF = '#EEEEEE';
var C_MAP_COUN = '#3366CC';
var C_MAP_COUN_SEL = '#CCCCCC';
var C_MAP_PATH = '#00BB00';
var C_MAP_ISD1 = '#0099FF';
var C_MAP_ISD2 = '#FF9900';
var C_MAP_ISD_BRD = '#FFFFFF';
var MS_SETUP_INTERVAL = 1000;
var MS_LIST_INTERVAL = 5000;
var UDP_ADDR = "127.0.0.1:7777";
var PARA_VER = '0.1';

var kBaseIndex = 0;
var kBaseIndexSel = 0;
var kBaseUrlSel = null;
var backgroundJobs = [];
var map;

// TODO (mwfarb): at some point store the window size in a recoverable setting
// TODO (mwfarb): show topology, links widening, perhaps as num, pct, width

window.onload = function() {
    // render blank map on load
    initMap();
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
    var list = document.getElementById("list");
    var resume = document.getElementById("resume");

    echoClient = newEchoClient(UDP_ADDR);
    connect.onclick = function(ev) {
        echoClient.disconnect();
        echoClient = newEchoClient(UDP_ADDR);
    };
    list.onclick = function(ev) {
        requestListUpdate();
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
    // TODO (mwfarb): load configuration like ISD Constraint from socket

    if (self.jTopo == null) {
        requestTopology();
    }
    if (self.jTopo != null && self.jLoc == null) {
        // locations should load only after topology has arrived
        requestLocations();
    }
    if (self.jLoc != null) {
        requestListUpdate();
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

function requestStayIsd(isd) {
    var req = {};
    req.version = PARA_VER;
    req.command = 'STAY_ISD';
    req.isd = parseInt(isd);
    if (isd == 'None' || req.isd == NaN) {
        return;
    }
    var jSend = JSON.stringify(req);
    sendRequest(jSend);

    map.updateChoropleth(updateMapIsdSelChoropleth(isd), {
        reset : true
    });
}

function requestListUpdate() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'LIST';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);

    // TODO (mwfarb): warn if knowledge base unavailable
}

function requestTopology() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'TOPO';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
}

function requestLocations() {
    var req = {};
    req.version = PARA_VER;
    req.command = 'LOCATIONS';
    var jSend = JSON.stringify(req);
    sendRequest(jSend);
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
            if (res[0].hasOwnProperty("a") && res[0].hasOwnProperty("b")
                    && res[0].hasOwnProperty("ltype")) {
                // topo
                handleRespTopology(res);
            } else {
                // list
                handleRespList(res);
            }
        } else {
            if (res.hasOwnProperty("sent_packets")) {
                // lookup
                handleRespLookup(res);
            } else if (res.hasOwnProperty("STATUS")) {
                // stay_isd
                handleRespStayIsd(res);
            } else {
                // locations
                handleRespLocations(res);
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

function handleRespTopology(res) {
    // store topology locally for later rendering
    self.jTopo = res;
    // parse topology for valid ISDs
    var select = document.getElementById("selectIsd");
    var isds = [];
    for (var l = 0; l < self.jTopo.length; l++) {
        var iface = self.jTopo[l].a.split("-");
        if (isds.indexOf(iface[0]) === -1) {
            isds.push(iface[0]);
        }
    }
    isds.sort();
    isds.unshift('None');
    // populate ISD list
    select.options.length = 0;
    for (var i = 0; i < isds.length; i++) {
        var opt = isds[i];
        var el = document.createElement("option");
        el.textContent = opt;
        el.value = opt;
        select.appendChild(el);
    }
}

function handleRespLocations(res) {
    // store locations locally for later rendering
    self.jLoc = res;

    // set interval to be more relaxed
    clearInterval(self.listIntervalId);
    refreshSocketData();
    self.listIntervalId = setInterval(function() {
        refreshSocketData();
    }, MS_LIST_INTERVAL);

    // Show AS and ISD numbers on the map on the countries
    map.bubbles(updateMapIsdAsBubbles());
}

function handleRespList(res) {
    // add elements from list to accordion
    res.forEach(function(entry) {
        addUrlToAccordion(entry);
    });
    sortAccordion();
}

function handleRespLookup(res) {
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

    // when accordion opens draw the map, countries
    map.updateChoropleth(updateMapIsdAsChoropleth(res), {
        reset : true
    });

    var src = res.if_lists[0][0];
    var dst = res.if_lists[0][res.if_lists[0].length - 1];
    map.bubbles(updateMapIsdAsBubbles(src.ISD + "-" + src.AS, dst.ISD + "-"
            + dst.AS));

    // show the links between the countries on the map, default to last path
    document.getElementsByName('radioPath')[res.if_lists.length].checked = true;
    map.arc(updateMapIsdAsArc(res, res.if_lists.length - 1));

    // Allow user selection of path in the accordion
    var rLen = document.getElementsByName('radioPath').length;
    for (var i = 0; i < rLen; i++) {
        document.getElementsByName('radioPath')[i].onclick = function() {
            map.arc(updateMapIsdAsArc(res, parseInt(this.value)));
        }
    }
}

function handleRespStayIsd(res) {
    // TODO (mwfarb): handle error case when setting ISD fails

    if (res.STATUS == 'OK') {
        var select = document.getElementById("selectIsd")
        for (var i = 0; i < select.length; i++) {
            // TODO (mwfarb): allow None to remain in list when all-ISDs socket
            // method is available
            if (select.options[i].value == 'None') {
                select.remove(i);
            }
        }

        // on set ISD make sure the clean accordion, stop list
        clearInterval(self.listIntervalId);
        document.getElementById("divStatsWidget").style.display = "none";
        document.getElementById("divResume").style.display = "block";
        map.arc([]);
        map.bubbles(updateMapIsdAsBubbles());
    }
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

// Datamaps...

function initMap() {
    map = new Datamap({
        scope : 'world',
        element : document.getElementById("interactiveMap"),
        // zoom to Eurasia
        setProjection : getMapProjection(),
        fills : {
            defaultFill : C_MAP_COUNDEF,
            "ISD Selected" : C_MAP_COUN_SEL,
            "ISD-1" : C_MAP_ISD1,
            "ISD-2" : C_MAP_ISD2,
            "Route Path" : C_MAP_PATH,
        },
        bubblesConfig : {
            borderWidth : 1,
            borderOpacity : 1,
            borderColor : C_MAP_ISD_BRD,
            popupOnHover : true,
            radius : null,
            popupTemplate : getBubblePopupTemplate(),
            fillOpacity : 0.75,
            animate : true,
            highlightOnHover : true,
            exitDelay : 100,
        },
        arcConfig : {
            arcSharpness : 0.75,
            animationSpeed : 100,
            strokeColor : C_MAP_PATH,
        },
        done : getFinishDrawAction()
    });
    map.legend({
        defaultFillName : 'No ISD:'
    });
}

function getFinishDrawAction() {
    return function(datamap) {
        datamap.svg.call(d3.behavior.zoom().on("zoom", redraw));
        function redraw() {
            var prefix = '-webkit-transform' in document.body.style ? '-webkit-'
                    : '-moz-transform' in document.body.style ? '-moz-'
                            : '-ms-transform' in document.body.style ? '-ms-'
                                    : '';
            var x = d3.event.translate[0];
            var y = d3.event.translate[1];
            datamap.svg.selectAll("g").style(
                    prefix + 'transform',
                    'translate(' + x + 'px, ' + y + 'px) scale('
                            + (d3.event.scale) + ')');
        }
    };
}

function getBubblePopupTemplate() {
    return function(geography, data) {
        return '<div class="hoverinfo"><strong>' + data.name
                + '</strong></div>';
    };
}

function getMapProjection(element) {
    return function(element) {
        var projection = d3.geo.equirectangular().center([ 60, 35 ]).rotate(
                [ 0, 0 ]).scale(250).translate(
                [ element.offsetWidth / 2, element.offsetHeight / 2 ]);
        var path = d3.geo.path().projection(projection);
        return {
            path : path,
            projection : projection
        };
    };
}

function updateMapIsdAsChoropleth(res) {
    // build list of ISD-AS used in these paths
    var isdAs = [];
    var isd = {};
    for (var i = 0; i < res.if_lists.length; i++) {
        for (var ifNum = 0; ifNum < res.if_lists[i].length; ifNum++) {
            var ifRes = res.if_lists[i][ifNum];
            isdAs.push(ifRes.ISD + '-' + ifRes.AS);
            isd[ifRes.ISD] = true;
        }
    }
    var countries = {};
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        if (isd[ifNum[0]]) {
            if (self.jLoc.hasOwnProperty(isdAs)) {
                var iso2 = self.jLoc[isdAs];
                // find 3 loc code base don 2loc code
                if (iso3.hasOwnProperty(iso2)) {
                    countries[iso3[iso2]] = {
                        fillKey : "ISD Selected",
                    };
                }
            }
        }
    }
    return countries;
}

function updateMapIsdAsArc(res, path) {
    var routes = [];
    if (path < 0) {
        for (var i = 0; i < res.if_lists.length; i++) {
            routes.push(i);
        }
    } else {
        routes.push(path);
    }
    var arcs = [];
    for (var p = 0; p < routes.length; p++) {
        var pNum = parseInt(routes[p]);
        for (var ifNum = 0; ifNum < (res.if_lists[pNum].length - 1); ifNum++) {
            var ifRes = res.if_lists[pNum][ifNum];
            var ifResNext = res.if_lists[pNum][ifNum + 1];
            var iso2 = self.jLoc[ifRes.ISD + '-' + ifRes.AS];
            var iso2Next = self.jLoc[ifResNext.ISD + '-' + ifResNext.AS];
            if (iso2 == iso2Next) {
                // skip internal routing when making arcs
                continue;
            }
            // find lat long
            var arc = {
                origin : {
                    latitude : latlong[iso2][0],
                    longitude : latlong[iso2][1]
                },
                destination : {
                    latitude : latlong[iso2Next][0],
                    longitude : latlong[iso2Next][1]
                }
            };
            arcs.push(arc);
        }
    }
    return arcs;
}

function updateMapIsdAsBubbles(src, dst) {
    var bubbles = [];
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        if (self.jLoc.hasOwnProperty(isdAs)) {
            if (src != null && isdAs == src) {
                label = " (source)";
                rad = 8;
            } else if (dst != null && isdAs == dst) {
                label = " (destination)";
                rad = 8;
            } else {
                label = '';
                rad = 4;
            }
            var bubble = {
                name : isdAs + label,
                latitude : latlong[self.jLoc[isdAs]][0],
                longitude : latlong[self.jLoc[isdAs]][1],
                radius : rad,
                fillKey : (ifNum[0] == "1" ? "ISD-1" : "ISD-2"),
            };
            bubbles.push(bubble);
        }
    }
    return bubbles;
}

function updateMapIsdSelChoropleth(isd_sel_str) {
    // outline selcted ISDs
    var countries = {};
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        if (isd_sel_str == "0" || isd_sel_str == ifNum[0]) {
            if (self.jLoc.hasOwnProperty(isdAs)) {
                var iso2 = self.jLoc[isdAs];
                // find 3 loc code base don 2loc code
                if (iso3.hasOwnProperty(iso2)) {
                    countries[iso3[iso2]] = {
                        fillKey : "ISD Selected",
                    };
                }
            }
        }
    }
    return countries;
}

// JQuery...

$(function() {
    // initialize URL accordion widget
    $(".urlStatsWidget").accordion({
        autoHeight : true,
        collapsible : true,
        active : false,
        heightStyle : "content",
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
            // when closing accordion clean the map
            map.updateChoropleth(null, {
                reset : true
            });
            map.arc([]);
            map.bubbles(updateMapIsdAsBubbles());
        }
    });
    $(".toEnable").each(function() {
        $(this).removeClass("ui-state-disabled");
    });
    $(".toDisable").each(function() {
        $(this).addClass("ui-state-disabled");
    });

    // TODO (mwfarb): change color of list items when disabled

    // initialize ISD selection box
    $('#selectIsd').change(function() {
        var isd = $(this).val();
        requestStayIsd(isd);
    });
});
