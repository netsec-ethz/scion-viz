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

/*
 * TODO (mwfarb): topology.js and tab-topocola.js are used in more then one
 * web project and should therefore eventually be moved to a central
 * maintenance location to avoid duplication.
 */

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

// Paths graph
var default_link_color = "#999999";
var default_link_opacity = "0.35";
var p_link_dist = 80; // paths link distance
var p_r = 20; // path node radius
var pt_w = 90; // text node rect width
var pt_h = 35; // text node rect height
var pt_r = 4; // text node rect corner radius
var pl_w = 20; // path legend width

var pageBounds;
var circlesg;
var linesg;

/*
 * Post-rendering method to add labels to paths graph.
 */
function topoSetup(msg, width, height) {

    if (graphPath == undefined) {
        console.error("No graphPath to add setup!!");
        return;
    }

    for (key in msg) {
        setup[key] = msg[key];
    }

    // attempt to fix source and destination labels at bottom of graph
    if (msg.hasOwnProperty("destination") && !destination_added) {
        addFixedLabel("destination", (width * .6), (height * .85), false);
        destination_added = true;
    }
    if (msg.hasOwnProperty("source") && !source_added) {
        addFixedLabel("source", (width * .4), (height * .85), true);
        source_added = true;
    }

    // TODO (mwfarb): the position these text anchors should change with the
    // relative number of as nodes to be increasingly farther apart
    // and into the bottom corners to encourage complex paths to spread out for
    // better viewing.
}

/*
 * Post rendering method to assign colors to path node links and labels.
 */
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

/*
 * Updates path visibility and style properties.
 */
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

/*
 * Initializes paths graph, its handlers, and renders it.
 */
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
    colaPath = cola.d3adaptor().linkDistance(p_link_dist).avoidOverlaps(true)
            .handleDisconnected(true).size([ width, height ]).alpha(0);

    svgPath = d3.select("#" + div_id).append("svg").attr("width", width).attr(
            "height", height);

    pageBounds = {
        x : 0,
        y : 0,
        width : width,
        height : height
    };

    // Arrow marker
    svgPath.append("defs").selectAll("marker").data(
            [ colorPaths, colorSegCore, colorSegDown, colorSegUp ]).enter()
            .append("marker").attr("id", function(d) {
                return d;
            }).attr("viewBox", "0 -5 10 10").attr("refX", p_r + 10).attr(
                    "refY", -5).attr("markerWidth", 6).attr("markerHeight", 6)
            .attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5")
            .attr('fill', function(d, i) {
                return d
            });

    linesg = svgPath.append("g");
    pathsg = svgPath.append("g");
    circlesg = svgPath.append("g");

    update();
    drawLegend(original_json_data);
    topoColor({
        "source" : "none",
        "destination" : "none",
        "path1" : "red",
        "path2" : "green",
        "path3" : "blue"
    });
}

/*
 * Calculates the constraints properties used by webcola to render initial graph
 * inside window boundaries.
 */
function calcConstraints(realGraphNodes) {
    var topLeft = {
        x : pageBounds.x,
        y : pageBounds.y,
        fixed : true
    };
    var tlIndex = graphPath.nodes.push(topLeft) - 1;
    var bottomRight = {
        x : pageBounds.x + pageBounds.width,
        y : pageBounds.y + pageBounds.height,
        fixed : true
    };
    var brIndex = graphPath.nodes.push(bottomRight) - 1;
    var constraints = [];

    for (var i = 0; i < realGraphNodes.length; i++) {
        constraints.push({
            axis : 'x',
            type : 'separation',
            left : tlIndex,
            right : i,
            gap : p_r
        });
        constraints.push({
            axis : 'y',
            type : 'separation',
            left : tlIndex,
            right : i,
            gap : p_r
        });
        constraints.push({
            axis : 'x',
            type : 'separation',
            left : i,
            right : brIndex,
            gap : p_r
        });
        constraints.push({
            axis : 'y',
            type : 'separation',
            left : i,
            right : brIndex,
            gap : p_r
        });
    }
    return constraints;
}

/*
 * Paths graph update method to iterate over all nodes and links when changes
 * occur like, adding or removing path arcs.
 */
function update() {
    var realGraphNodes = graphPath.nodes.slice(0);

    var constraints = calcConstraints(realGraphNodes);
    colaPath.constraints(constraints).links(graphPath.links).nodes(
            graphPath.nodes)

    var path = linesg.selectAll("path.link").data(graphPath.links)
    path.enter().append("path").attr(
            "class",
            function(d) {
                return d.type + " link " + "source-" + d.source.name
                        + " target-" + d.target.name;
            }).attr("stroke", default_link_color).attr("stroke-opacity",
            default_link_opacity);
    path.exit().remove();

    var markerLinks = graphPath.links.filter(function(link) {
        return link.path;
    });
    var markerPath = pathsg.selectAll("path.marker").data(markerLinks)
    markerPath.enter().append("path").attr("class", function(d) {
        console.log("marker " + d.type);
        return "marker " + d.type;
    }).attr("marker-end", function(d) {
        return "url(#" + d.color + ")";
    }).style("stroke", function(d) {
        return d.color;
    });
    markerPath.exit().remove();

    var node = circlesg.selectAll(".node").data(realGraphNodes, function(d) {
        return d.name;
    })
    var nodeg = node.enter().append("g").attr("class", function(d) {
        return "node";
    }).attr("id", function(d) {
        return "node_" + d.name;
    }).call(colaPath.drag).attr("transform", transform);

    nodeg.append("rect").attr("width", function(d) {
        return (d.type == "host") ? pt_w : (2 * p_r)
    }).attr("height", function(d) {
        return (d.type == "host") ? pt_h : (2 * p_r)
    }).attr("rx", function(d) {
        return (d.type == "host") ? pt_r : (2 * p_r)
    }).attr("ry", function(d) {
        return (d.type == "host") ? pt_r : (2 * p_r)
    }).attr("x", function(d) {
        return (d.type == "host") ? -pt_w / 2 : -p_r
    }).attr("y", function(d) {
        return (d.type == "host") ? -pt_h / 2 : -p_r
    }).style("fill", function(d) {
        return (d.type == "host") ? "white" : colorPath(d.group);
    }).style("visibility", function(d) {
        return (d.type == "placeholder") ? "hidden" : "visible";
    }).attr("stroke", default_link_color);

    nodeg.append("text").attr("text-anchor", "middle").attr("y", ".35em").attr(
            "class", function(d) {
                return d.type + " label";
            }).text(function(d) {
        return d.name
    }).style("visibility", function(d) {
        return (d.type == "placeholder") ? "hidden" : "visible";
    });

    node.exit().remove();

    colaPath.on("tick", function(d) {

        path.attr("d", linkStraight);
        markerPath.attr("d", linkArc);
        node.attr("transform", transform);
    });

    colaPath.start(10, 15, 20)
}

/*
 * Returns the SVG instructions for rendering a path arc as a straight line.
 */
function linkStraight(d) {
    var x1 = Math.max(p_r, Math.min(pageBounds.width - p_r, d.source.x));
    var y1 = Math.max(p_r, Math.min(pageBounds.height - p_r, d.source.y));
    var x2 = Math.max(p_r, Math.min(pageBounds.width - p_r, d.target.x));
    var y2 = Math.max(p_r, Math.min(pageBounds.height - p_r, d.target.y));

    var dr = 0;
    return "M" + x1 + "," + y1 + "A" + dr + "," + dr + " 0 0,1 " + x2 + ","
            + y2;
}

/*
 * Returns the SVG instructions for rendering a path arc.
 */
function linkArc(d) {
    var x1 = Math.max(p_r, Math.min(pageBounds.width - p_r, d.source.x));
    var y1 = Math.max(p_r, Math.min(pageBounds.height - p_r, d.source.y));
    var x2 = Math.max(p_r, Math.min(pageBounds.width - p_r, d.target.x));
    var y2 = Math.max(p_r, Math.min(pageBounds.height - p_r, d.target.y));

    var dx = x2 - x1;
    var dy = y2 - y1;
    var dr = Math.sqrt(dx * dx + dy * dy);
    return "M" + x1 + "," + y1 + "A" + dr + "," + dr + " 0 0,1 " + x2 + ","
            + y2;
}

/*
 * Creates the instructions for positioning each node.
 */
function transform(d) {
    var dx = Math.max(p_r, Math.min(pageBounds.width - p_r, d.x));
    var dy = Math.max(p_r, Math.min(pageBounds.height - p_r, d.y));
    return "translate(" + dx + "," + dy + ")";
}

/*
 * Build legend labels based only on visible nodes.
 */
function buildLabels(json_path) {
    var shown = [];
    for (var i = 0; i < json_path.length; i++) {
        var core = json_path[i].ltype == 'CORE'
        if (!ISDAS.test(json_path[i].a)) {
            console.error(json_path[i].a + ' is not a valid ISD-AS!')
        } else if (core) { // only link src can be core
            var isdA = json_path[i].a.split('-')[0]
            shown.push(((parseInt(isdA) - 1) * 4) + (core ? 0 : 1))
        }
        if (!ISDAS.test(json_path[i].b)) {
            console.error(json_path[i].b + ' is not a valid ISD-AS!')
        } else {
            var isdB = json_path[i].b.split('-')[0]
            shown.push(((parseInt(isdB) - 1) * 4) + (core ? 0 : 1))
        }
    }
    return shown;
}

/*
 * Renders the paths legend and color key. Labels should not be "shown" in the
 * legend if they are not in the actual topology being displayed.
 */
function drawLegend(json_path) {
    var shown = buildLabels(json_path)
    var idx = 0;
    var legend = svgPath.selectAll(".legend").data(colorPath.domain()).enter()
            .append("g").attr("class", "legend").attr("transform",
            // Use our enumerated idx for labels, not all-color index i
            function(d, i) {
                if (shown.includes(d)) {
                    var render = "translate(0," + idx * (pl_w + 2) + ")";
                    idx++;
                    return render;
                } else {
                    return "translate(0,0)";
                }
            });
    legend.append("rect").attr("x", 0).attr("width", pl_w).attr("height", pl_w)
            .style("fill", colorPath).style("visibility", function(d) {
                if (shown.includes(d)) {
                    return "visible";
                } else {
                    return "hidden";
                }
            })
    legend.append("text").attr("x", pl_w + 5).attr("y", pl_w / 2).attr("dy",
            ".35em").style("text-anchor", "begin").text(function(d) {
        if (shown.includes(d)) {
            if (d % 2 === 0) {
                return 'ISD-' + (d / 4 + 1) + ' core';
            } else {
                return 'ISD-' + (((d - 1) / 4) + 1);
            }
        } else {
            return null;
        }
    });
}

/*
 * Post-rendering method to add a label attached to a fixed point on the graph.
 */
function addFixedLabel(label, x, y, lastLabel) {
    // remove last 2 constraint nodes from the end first
    if (!lastLabel) {
        graphPath.nodes.pop();
        graphPath.nodes.pop();
    }

    // update graph elements with additions
    graphPath["ids"][label] = Object.keys(graphPath["ids"]).length;
    graphPath.nodes.push({
        name : label,
        group : 1,
        type : "host",
        x : x,
        y : y,
        fixed : true,
    });
    if (graphPath["ids"][setup[label]]) {
        graphPath.links.push({
            source : graphPath["ids"][setup[label]],
            target : graphPath["ids"][label],
            type : "host",
        });
    }

    // redraw graph, recalculating constraints
    if (lastLabel) {
        update();
    }
}

/*
 * Post-rendering method to draw path arcs for the given path and color.
 */
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

    graphPath.nodes.pop();
    graphPath.nodes.pop();
    // reset
    graphPath.links = graphPath.links.filter(function(link) {
        return !link.path;
    });
    for (var i = 0; i < path_ids.length - 1; i++) {
        graphPath.links.push({
            "color" : color,
            "path" : true,
            "source" : graphPath["ids"][path_ids[i]],
            "target" : graphPath["ids"][path_ids[i + 1]],
            "type" : "PARENT"
        });
    }
    update();
}

/*
 * Removes all path arcs from the graph.
 */
function restorePath() {

    topoColor({
        "path1" : "none"
    });

    graphPath.nodes.pop();
    graphPath.nodes.pop();
    // reset
    graphPath.links = graphPath.links.filter(function(link) {
        return !link.path;
    });
    update();
}
