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

var C_HEAD = '9080FF'; // supplied by jQuery
var C_STAT = '99CCFF';
var MS_LIST_INTERVAL = 5000;
var UDP_ADDR = "127.0.0.1:7777";

window.onload = function() {

	// listen for messages from ext after window opened
	chrome.runtime.onMessageExternal.addListener(function(request, sender,
			sendResponse) {

		if (request.urls) {
			console.log("Received message 'urls': " + request.urls);
			var u = JSON.parse(request.urls);
			addUrlToAccordion(u);
			sortAccordion();
		}
	});
}

// D3 simple table...

// TODO (mwfarb): show topology, links widening, perhaps as num, pct, width, cut
// node.

var j = function(name, arr) {
	var r = {};
	r.name = name;
	for (i = 0; i < arr.length; i++) {
		r["path" + i] = arr[i];
	}
	return r;
};

var kBaseIndex = 0;
var kBaseIndexSel = 0;
var kBaseUrlSel = null;
var nullStats = []

var backgroundJobs = nullStats;

function renderStats(index) {

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
	var lookup = document.getElementById("lookup");

	echoClient = newEchoClient(UDP_ADDR);
	connect.onclick = function(ev) {
		echoClient.disconnect();
		echoClient = newEchoClient(UDP_ADDR);
	};
	list.onclick = function(ev) {
		requestListUpdate();
	};
	lookup.onclick = function(ev) {
		// send lookup cmd for current url
		echoClient.sender();
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

		// prepare list method after connection
		clearInterval(self.listIntervalId);
		requestListUpdate();
		self.listIntervalId = setInterval(function() {
			requestListUpdate();
		}, MS_LIST_INTERVAL);
	});
	return ec;

	// TODO (mwfarb): serialize all UDP requests, probably in networking.js
};

var attachSend = function(client) {
	return function(e) {
		var c = kBaseUrlSel.split(" ");
		var u = {};
		u.version = '0.1';
		u.command = 'LOOKUP';
		u.req_type = c[0];
		u.res_name = c[1];

		var jSend = JSON.stringify(u);
		var jLen = jSend.length;

		var dataLookup = str2ab(ab2str(toBytesUInt32(jLen)) + jSend);

		client.echo(dataLookup, function() {
		});
	};
};

function requestListUpdate() {
	var u = {};
	u.version = '0.1';
	u.command = 'LIST';

	var jSend = JSON.stringify(u);
	var jLen = jSend.length;

	var dataList = str2ab(ab2str(toBytesUInt32(jLen)) + jSend);

	// TODO (mwfarb): warn if knowledge base unavailable

	echoClient.echo(dataList, function() {
	});
}

function updateUiUdpSent(text) {
	console.log('send', "'" + text + "'");
}

function updateUiUdpRecv(text) {
	console.log('receive', "'" + text + "' ");

	var jLen = fromBytesUInt32(str2ab(text.substring(0, 4)));
	var jData = text.substring(4);
	// check length
	if (jLen != jData.length) {
		console.log("Lengths not equal: " + jLen + "," + jData.length);
	}

	try {
		var u = JSON.parse(jData);
		if (Array.isArray(u)) {
			// list
			u.forEach(function(entry) {
				addUrlToAccordion(entry);
			});
			sortAccordion();

		} else {
			// lookup
			var head = [];
			var lrs = [];
			for (i = 0; i < u.loss_rates.length; i++) {
				head.push("P" + i);
				lrs.push(u.loss_rates[i].toFixed(2));
			}
			var arrPcts = [
					j('', head),
					j('sent pkts', (u.sent_packets ? u.sent_packets : '-')),
					j('recv pkts', (u.received_packets ? u.received_packets
							: '-')),
					j('ack pkts', (u.acked_packets ? u.acked_packets : '-')),
					j('rtts', (u.rtts ? u.rtts : '-')),
					j('loss rates', (lrs ? lrs : '-')),
					j('IF counts', (u.if_counts ? u.if_counts : '-')) ];
			backgroundJobs = arrPcts.concat(getInterfaceListRows(u));
			renderStats(kBaseIndexSel);
		}
	} catch (e) {
		if (e instanceof SyntaxError) {
			console.log("JSON parse error: %s", e);
		} else {
			throw e;
		}
	}
}

function getInterfaceListRows(u) {
	var rows = [];
	var r = 0;
	var found = true;
	var max_count = Math.max.apply(null, u.if_counts);
	do {
		var row = [];
		for (c = 0; c < u.if_lists.length; c++) {
			if (r < u.if_counts[c]) {
				var n = u.if_lists[c][r];
				row.push(n.IFID + '-' + n.ISD + '-' + n.AS);
			} else {
				row.push('-');
			}
		}
		rows.push(j('IF' + r, (row ? row : '-')));
		r++;
	} while (r < max_count);
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

function addUrlToAccordion(url) {
	var header = url[0] + " " + url[1];
	$(function() {
		// determine which elements are new
		var foundin = $('body:contains("' + header + '")');
		if (!foundin.length) {
			// add urls to widget
			var newDiv = "<h3>" + url[0] + " " + url[1] + "</h3><div id='"
					+ kBaseIndex + "' style='background-color:#" + C_STAT
					+ ";'><table><tbody></tbody></table></div>";
			$(".urlStatsWidget").append(newDiv)
			$(".urlStatsWidget").accordion("refresh");
			kBaseIndex++;
		}
	});
}

function str2ab(str) {
	var encoder = new TextEncoder('utf-8');
	return encoder.encode(str).buffer;
}

function ab2str(ab) {
	var dataView = new DataView(ab);
	var decoder = new TextDecoder('utf-8');
	return decoder.decode(dataView);
}

function toBytesUInt32(num) {
	var ab = new ArrayBuffer(4);
	var view = new DataView(ab);
	view.setUint32(0, num, false);
	console.log("toBytesUInt32 " + view.getUint32(0).toString(16));
	return ab;
}

function fromBytesUInt32(ab) {
	var view = new DataView(ab);
	console.log("fromBytesUInt32 " + view.getUint32(0).toString(16));
	return view.getUint32(0, false);
}

// JQuery...

// initialize accordion widget
$(function() {
	$(".urlStatsWidget").accordion({
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
			// accordion is expanding, start udp lookups
			kBaseUrlSel = ui.newHeader[0].innerText;
			kBaseIndexSel = ui.newPanel.attr('id');
			console.log("activate init event: " + kBaseIndexSel);
			if (echoClient != null) {
				echoClient.sender();
			}
		}
	});
	$(".toEnable").each(function() {
		$(this).removeClass("ui-state-disabled");
	});
	$(".toDisable").each(function() {
		$(this).addClass("ui-state-disabled");
	});

	// TODO (mwfarb): change color of list items when disabled
});
