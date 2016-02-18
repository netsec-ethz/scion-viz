/*
 *  Node.js UDP echo server
 *
 *  This demonstration shows a basic echo server that has randomly drops responses.
 *  The drop factor is `threshold` 0.99 = 99% chance of success, 1% dropped packets
 * 
 *  Additionally each response is delayed by 1/2 seconds.
 * 
 *  Listens on port 7777 by default. Pass in a desired port as cmdline argument.
 */

var dgram = require('dgram');
var server = dgram.createSocket('udp4');

var threshold = 0.99;

var reqs = [ [ "CONNECT", "self-repair.mozilla.org:443" ],
		[ "CONNECT", "collector.githubapp.com:443" ],
		[ "CONNECT", "www.google-analytics.com:443" ],
		[ "POST", "http://clients1.google.com/ocsp" ],
		[ "CONNECT", "api.github.com:443" ],
		[ "CONNECT", "geo.mozilla.org:443" ],
		[ "CONNECT", "avatars2.githubusercontent.com:443" ],
		[ "CONNECT", "live.github.com:443" ],
		[ "POST", "http://ocsp.digicert.com/" ],
		[ "CONNECT", "avatars0.githubusercontent.com:443" ],
		[ "CONNECT", "github.com:443" ] ];

server.on("listening", function() {
	var address = server.address();
	console.log("Listening on " + address.address);
});

server.on("message", function(message, rinfo) {
	var delay = 500 + Math.random() * 1000;
	// Echo the message back to the client.
	var dropped = Math.random();
	if (dropped > threshold) {
		console.log("Recieved message from: " + rinfo.address + ", DROPPED");
		return;
	}
	console.log("Recieved message from: " + rinfo.address + "," + message + ","
			+ message.length);
	var jLen = message.readUInt32BE(0);
	var jData = message.toString("utf-8", 4);

	// TODO: lengths not equal over 256 length son on js server
	// test?

	// check length
	if (jLen != jData.length) {
		console.log("Lengths not equal: " + jLen + "," + jData.length);
		return;
	}

	// parse the json
	var rc = JSON.parse(jData);
	var jData = null;

	// add dummy parameters before echoing back
	if (rc.command == 'LOOKUP') {
		var u = {};
		u.sent_packets = getRandomIntArray(0, 100, 12);
		u.received_packets = getRandomIntArray(0, 100, 12);
		u.acked_packets = getRandomIntArray(0, 100, 12);
		u.rtts = getRandomIntArray(10000, 99999, 12);
		u.loss_rates = getRandomDoubleArray(12);
		u.if_lists = [];
		u.if_counts = [];
		for (c = 0; c < 12; c++) {
			u.if_counts.push(getRandomInt(10, 16));
			var col = [];
			for (r = 0; r < u.if_counts[c]; r++) {
				var n = {};
				n.IFID = getRandomInt(1, 5);
				n.ISD = getRandomInt(1, 2);
				n.AD = getRandomInt(10, 25);
				col.push(n);
			}
			u.if_lists.push(col);
		}
		jData = JSON.stringify(u);

	} else if (rc.command == 'LIST') {
		var lu = [];
		lu.push(reqs[getRandomInt(0, 10)]);
		lu.push(reqs[getRandomInt(0, 10)]);
		lu.push(reqs[getRandomInt(0, 10)]);
		jData = JSON.stringify(lu);
	}

	var buf = new Buffer(4);
	buf.writeUInt32BE(jData.length, 0);

	var resp = Buffer.concat([ buf, new Buffer(jData) ]);

	setTimeout(function() {
		server.send(resp, 0, resp.length, rinfo.port, rinfo.address, function(
				err, bytes) {
			console.log(err, bytes);
		});
	}, delay);
});

server.on("close", function() {
	console.log("Socket closed");
});

var port = process.argv[2];
server.bind(port ? parseInt(port) : 7777);

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

function getRandomIntArray(min, max, total) {
	var arr = [ total ];
	for (var i = 0; i < total; i++) {
		arr[i] = getRandomInt(max, min);
	}
	return arr;
}

function getRandomDoubleArray(total) {
	var arr = [ total ];
	for (var i = 0; i < total; i++) {
		arr[i] = Math.random();
	}
	return arr;
}

function getRandomULong(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}
