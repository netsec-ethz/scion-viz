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

// -------------------------------- General -----------------------------------
var setup = {};
var colors = {};

var source_added = false;
var destination_added = false;

var width = window.innerWidth;
var height = window.innerHeight;

var possible_colors = {
    "red" : "#ff0000",
    "green" : "#66ff66",
    "yellow" : "#ffee33",
    "purple" : "#aa33ff",
    "black" : "#222222",
    "none" : "#ffffff",
}

var default_link_color = "#999999";
var default_link_opacity = "0.35";
var link_dist = 80;

var r = 20;
var w = 90;
var h = 35;

// ------------------------------- Setup ----------------------------------

function topoSetup(msg) {
    for (key in msg) {
        setup[key] = msg[key];
    }

    if (msg.hasOwnProperty("source") && !source_added) {
        addLabel("source");
        source_added = true;
    }
    if (msg.hasOwnProperty("destination") && !destination_added) {
        addLabel("destination");
        destination_added = true;
    }
}

function topoColor(msg) {
    for (key in msg) {
        colors[key] = msg[key];

        acceptable_paths = [ "path1", "path2", "path3" ];

        if (acceptable_paths.indexOf(key) != -1) {
            var prev = "none";

            for (i in setup[key]) {
                if (prev != "none") {
                    if (msg[key] != "none") {
                        $(".source-" + prev + ".target-" + setup[key][i]).attr(
                                "stroke", possible_colors[msg[key]]).attr(
                                "stroke-opacity", "1");

                        $(".source-" + setup[key][i] + ".target-" + prev).attr(
                                "stroke", possible_colors[msg[key]]).attr(
                                "stroke-opacity", "1");
                    } else {
                        $(".source-" + prev + ".target-" + setup[key][i]).attr(
                                "stroke", default_link_color).attr(
                                "stroke-opacity", default_link_opacity);

                        $(".source-" + setup[key][i] + ".target-" + prev).attr(
                                "stroke", default_link_color).attr(
                                "stroke-opacity", default_link_opacity);
                    }
                }
                prev = setup[key][i];
            }
        }
    }

    if (msg.hasOwnProperty("source")) {
        $(".node.source").attr("fill", possible_colors[msg["source"]]);
    }

    if (msg.hasOwnProperty("destination")) {
        $(".node.destination")
                .attr("fill", possible_colors[msg["destination"]]);
    }
}

// -------------------------------- Topology ----------------------------------

function drawTopology(original_json_data, width, height) {

    var forced_layout_json_text = createGraphJson(original_json_data);
    graph = JSON.parse(forced_layout_json_text);

    console.log(JSON.stringify(graph));

    color = d3.scale.category20();

    d3cola = cola.d3adaptor().linkDistance(link_dist).avoidOverlaps(false)
            .handleDisconnected(true).size([ width, height ]);

    svg = d3.select("#TopologyGraph").append("svg").attr("id", "topology")
            .attr("width", width).attr("height", height);

    drawTopo();

    topoColor({
        "source" : "none",
        "destination" : "none",
        "path1" : "red",
        "path2" : "green",
        "path3" : "yellow"
    });
}

function drawTopo() {
    d3cola.nodes(graph.nodes).links(graph.links).start(20, 20, 20);

    var link = svg.selectAll(".link").data(graph.links);

    link.enter().append("line").attr(
            "class",
            function(d) {
                return d.type + " link " + "source-" + d.source.name
                        + " target-" + d.target.name;
            }).attr("stroke", default_link_color).attr("stroke-opacity",
            default_link_opacity);

    link.exit().remove();

    var node = svg.selectAll(".node").data(graph.nodes);

    node.enter().append("rect").attr("width", function(d) {
        return (d.type == "host") ? w : (2 * r)
    }).attr("height", function(d) {
        return (d.type == "host") ? h : (2 * r)
    }).attr("rx", function(d) {
        return (d.type == "host") ? 4 : (2 * r)
    }).attr("ry", function(d) {
        return (d.type == "host") ? 4 : (2 * r)
    }).attr("class", function(d) {
        return d.name + " node " + d.type;
    }).attr("fill", function(d) {
        return (d.type == "host") ? "white" : color(d.group);
    }).call(d3cola.drag);

    var label = svg.selectAll(".label").data(graph.nodes);

    label.enter().append("text").attr("class", function(d) {
        return d.type + " label";
    }).text(function(d) {
        return d.name;
    }).call(d3cola.drag);

    d3cola.on("tick", function() {
        link.attr("x1", function(d) {
            return d.source.x;
        }).attr("y1", function(d) {
            return d.source.y;
        }).attr("x2", function(d) {
            return d.target.x;
        }).attr("y2", function(d) {
            return d.target.y;
        });

        node.attr("x", function(d) {
            return (d.type == "host") ? d.x - (w / 2) : d.x - r;
        }).attr("y", function(d) {
            return (d.type == "host") ? d.y - (h / 2) : d.y - r;
        });

        label.attr("x", function(d) {
            return d.x
        }).attr("y", function(d) {
            var h = this.getBBox().height;
            return d.y + (h / 4);
        });
    });

    // Legend
    var legend = svg.selectAll(".legend").data(color.domain()).enter().append(
            "g").attr("class", "legend").attr("transform", function(d, i) {
        return "translate(0," + i * 20 + ")";
    });

    legend.append("rect").attr("x", 0).attr("width", 18).attr("height", 18)
            .style("fill", color);

    legend.append("text").attr("x", 18 + 5).attr("y", 9).attr("dy", ".35em")
            .style("text-anchor", "begin").text(function(d) {
                if ((d % 2) === 0) {
                    return 'ISD-' + ((d / 4) + 1) + ' core';
                } else {
                    return 'ISD-' + (((d - 1) / 4) + 1);
                }
            });
}

function addLabel(label) {
    graph["ids"][label] = Object.keys(graph["ids"]).length;

    graph["nodes"].push({
        name : label,
        group : 1,
        type : "host"
    });
    graph["links"].push({
        source : graph["ids"][setup[label]],
        target : graph["ids"][label],
        type : "host"
    });

    drawTopo();
}

function drawPath(res, path) {
    // get the index of the routes to render
    var routes = [];
    if (path < 0) {
        for (var i = 0; i < res.if_lists.length; i++) {
            routes.push(i);
        }
    } else {
        routes.push(path);
    }
    var pathids = [];
    for (var p = 0; p < routes.length; p++) {
        var pNum = parseInt(routes[p]);
        // select the target path, and make iteration as amount of how many
        for (var ifNum = 0; ifNum < res.if_lists[pNum].length; ifNum++) {
            var ifRes = res.if_lists[pNum][ifNum];
            pathids.push(ifRes.ISD + '-' + ifRes.AS);
        }
    }
    topoSetup({
        "path1" : pathids
    });
    topoColor({
        "path1" : "red"
    });
}

function restorePath() {
    topoColor({
        "path1" : "none"
    });
}

// --------------------------- Responsive Design ------------------------------

function resize_topology() {
    if (typeof self.jTopo !== "undefined") {
        var rect = document.getElementById("divTabs").getBoundingClientRect();
        var width = rect.width - 15
        var height = (rect.height - 50 - 5) - 15;
        if (height < 600) {
            height = 600;
        }
        svg.attr("width", width).attr("height", height);
        d3cola.size([ width, height ]).start();
    }
}

d3.select(window).on("resize", function() {
    resize_topology();
});

$(window).resize(function() {
    resize_topology();
});
