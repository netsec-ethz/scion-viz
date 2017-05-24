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
var graphPath;
var colorPath;
var colaPath;
var svgPath;

var setup = {};
var colors = {};

var source_added = false;
var destination_added = false;

var possible_colors = {
    "red" : "#ff0000",
    "green" : "#008000",
    "blue" : "#0000ff",
    "yellow" : "#ffff00",
    "purple" : "#800080",
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

    if (graphPath == undefined) {
        console.error("No graphPath to add setup!!");
        return;
    }

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
                    updatePathProperties(prev, setup[key][i], msg[key]);
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

function updatePathProperties(prevPath, currPath, color) {
    if (color != "none") {
        $(".source-" + prevPath + ".target-" + currPath).attr("stroke",
                possible_colors[color]).attr("stroke-opacity", "1");

        $(".source-" + currPath + ".target-" + prevPath).attr("stroke",
                possible_colors[color]).attr("stroke-opacity", "1");
    } else {
        $(".source-" + prevPath + ".target-" + currPath).attr("stroke",
                default_link_color)
                .attr("stroke-opacity", default_link_opacity);

        $(".source-" + currPath + ".target-" + prevPath).attr("stroke",
                default_link_color)
                .attr("stroke-opacity", default_link_opacity);
    }
}

// -------------------------------- Topology ----------------------------------

function drawTopology(div_id, original_json_data, width, height) {

    if (original_json_data.length == 0) {
        console.error("No data to draw topology!!");
        $("#" + div_id).text(function() {
            return "Path topology data unavailable.";
        });
        return;
    }

    graphPath = convertLinks2Graph(original_json_data);
    console.log(JSON.stringify(graphPath));

    colorPath = d3.scale.category20();

    colaPath = cola.d3adaptor().linkDistance(link_dist).avoidOverlaps(true)
            .handleDisconnected(true).size([ width, height ])

    svgPath = d3.select("#" + div_id).append("svg").attr("width", width).attr(
            "height", height);

    drawTopo();
    drawLegend();
    topoColor({
        "source" : "none",
        "destination" : "none",
        "path1" : "red",
        "path2" : "green",
        "path3" : "blue"
    });
}

function drawTopo() {

    colaPath.nodes(graphPath.nodes).links(graphPath.links).start();

    var link = svgPath.selectAll(".link").data(graphPath.links);

    link.enter().append("line").attr(
            "class",
            function(d) {
                return d.type + " link " + "source-" + d.source.name
                        + " target-" + d.target.name;
            }).attr("stroke", default_link_color).attr("stroke-opacity",
            default_link_opacity);

    link.exit().remove();

    var node = svgPath.selectAll(".node").data(graphPath.nodes);

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
        return (d.type == "host") ? "white" : colorPath(d.group);
    }).style("visibility", function(d) {
        return (d.type == "placeholder") ? "hidden" : "visible";
    }).call(colaPath.drag);

    var label = svgPath.selectAll(".label").data(graphPath.nodes);

    label.enter().append("text").attr("class", function(d) {
        return d.type + " label";
    }).text(function(d) {
        return d.name;
    }).style("visibility", function(d) {
        return (d.type == "placeholder") ? "hidden" : "visible";
    }).call(colaPath.drag);

    colaPath.on("tick", function() {
        link.attr("x1", function(d) {
            return Math.max(r, Math.min(width - r, d.source.x));
        }).attr("y1", function(d) {
            return Math.max(r, Math.min(width - r, d.source.y));
        }).attr("x2", function(d) {
            return Math.max(r, Math.min(width - r, d.target.x));
        }).attr("y2", function(d) {
            return Math.max(r, Math.min(width - r, d.target.y));
        });

        node.attr("x", function(d) {
            var bound = Math.max(r, Math.min(width - r, d.x));
            return bound - ((d.type == "host") ? (w / 2) : r);

        }).attr("y", function(d) {
            var bound = Math.max(r, Math.min(width - r, d.y))
            return bound - ((d.type == "host") ? (h / 2) : r);
        });

        node.attr("cx", function(d) {
            return d.x = Math.max(r, Math.min(width - r, d.x));
        }).attr("cy", function(d) {
            return d.y = Math.max(r, Math.min(height - r, d.y));
        });

        label.attr("x", function(d) {
            return d.x;
        }).attr("y", function(d) {
            var h = this.getBBox().height;
            return d.y + (h / 4);
        });
    });
}

function drawLegend() {
    // Legend
    var legend = svgPath.selectAll(".legend").data(colorPath.domain()).enter()
            .append("g").attr("class", "legend").attr("transform",
                    function(d, i) {
                        return "translate(0," + i * 20 + ")";
                    });

    legend.append("rect").attr("x", 0).attr("width", 18).attr("height", 18)
            .style("fill", colorPath);

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
    graphPath["ids"][label] = Object.keys(graphPath["ids"]).length;

    graphPath["nodes"].push({
        name : label,
        group : 1,
        type : "host"
    });
    graphPath["links"].push({
        source : graphPath["ids"][setup[label]],
        target : graphPath["ids"][label],
        type : "host"
    });

    drawTopo();
}

function drawPath(res, path, color) {
    // get the index of the routes to render
    var routes = [];
    if (path < 0) {
        for (var i = 0; i < res.if_lists.length; i++) {
            routes.push(i);
        }
    } else {
        routes.push(path);
    }
    var path_ids = [];
    for (var p = 0; p < routes.length; p++) {
        var pNum = parseInt(routes[p]);
        // select the target path, and make iteration as amount of how many
        for (var ifNum = 0; ifNum < res.if_lists[pNum].length; ifNum++) {
            var ifRes = res.if_lists[pNum][ifNum];
            path_ids.push(ifRes.ISD + '-' + ifRes.AS);
        }
    }
    topoSetup({
        "path1" : path_ids
    });
    topoColor({
        "path1" : color
    });
}

function restorePath() {
    topoColor({
        "path1" : "none"
    });
}
