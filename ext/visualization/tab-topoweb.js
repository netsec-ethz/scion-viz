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

function topoSetup(msg) {
    source_added = true;
    destination_added = true;
}

function topoColor(msg) {
    acceptable_paths = [];
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

    // get link IDs from the DOM object, and put them in the highlighed_path_ID
    // array
    for (var p = 0; p < routes.length; p++) {
        // okay. we parse route[p] into Integer, and it is contained in the
        // variable of pNum, which means now we know the path number that we
        // want to visualize at this iteration.
        var pNum = parseInt(routes[p]);

        // select the target path, and make iteration as amount of how many
        for (var ifNum = 0; ifNum < (res.if_lists[pNum].length - 1); ifNum++) {
            // iterate if? what is the if?
            var ifRes = res.if_lists[pNum][ifNum];
            var ifResNext = res.if_lists[pNum][ifNum + 1];
            if (ifRes == ifResNext) {
                // skip internal routing when making arcs
                continue;
            }
            var pathid = getPathId(ifRes.ISD + '-' + ifRes.AS, ifResNext.ISD
                    + '-' + ifResNext.AS);
            highlighted_path_ID.push(pathid);
        }
    }

    // iterate the highlighed_path_ID array, and highlight them
    for (var i = 0; i < highlighted_path_ID.length; i++) {
        console.log(" -- path: " + highlighted_path_ID[i]);
        var originalad = highlighted_path_ID[i];
        var iface = originalad.split("_");
        if (iface.length == 4) {
            var idx = lookupLinks(iface[1], iface[3]);
            if (idx > -1) {
                var old_style_attr = linksValue[idx];
                d3.select("#" + highlighted_path_ID[i]).attr("class",
                        function(d) {
                            return "link " + old_style_attr + " link SELECTED";
                        })
            }
        }
    }
}

/**
 * restore the original links
 */
function restorePath() {
    for (var i = 0; i < highlighted_path_ID.length; i++) {
        // 1) divide highlihted_path_ID into from - to information.
        // 1-1) use '_' to divide the string into several parts
        // 2) search links and get the original style code
        // 3) apply it to all of the paths in highlited_path_ID array

        var originalad = highlighted_path_ID[i];
        var iface = originalad.split("_");
        if (iface.length == 4) {
            var idx = lookupLinks(iface[1], iface[3]);
            if (idx > -1) {
                var old_style_attr = linksValue[idx];
                d3.select("#" + highlighted_path_ID[i]).attr(
                        "class",
                        function(d) {
                            console.log(" ** restored into ... " + "link "
                                    + old_style_attr);
                            return "link " + old_style_attr;
                        })
            }
        }
    }
    highlighted_path_ID = [];
}

function drawTopology(original_json_data, width, height) {

    var forced_layout_json_text = createGraphJson(original_json_data);

    graph = JSON.parse(forced_layout_json_text);

    // now for the visualizing part, copy and pasted from d3 tutorial example
    var color = d3.scale.category20();

    var force = d3.layout.force().nodes(graph.nodes).links(graph.links).size(
            [ width, height ]).linkDistance(40).charge(-1700).on("tick", tick)
            .start();

    if (typeof svg !== "undefined") {
        svg.remove();
    }
    svg = d3.select("#TopologyGraph").append("svg").attr("width", width).attr(
            "height", height);

    // Per-type markers, as they don't inherit styles.
    svg.append("defs").selectAll("marker")
            .data([ "PARENT", "ROUTING", "PEER" ]).enter().append("marker")
            .attr("id", function(d) {
                return d;
            }).attr("viewBox", "0 -5 10 10").attr("refX", 15)
            .attr("refY", -1.5).attr("markerWidth", 6).attr("markerHeight", 6)
            .attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5");

    var path = svg.append("g").selectAll("path").data(force.links()).enter()
            .append("path").attr("class", function(d) {
                return "link " + d.type
            }).attr("id", function(d) {
                return "source_" + d.source.name + "_target_" + d.target.name;
            });

    var circle = svg.append("g").selectAll("circle").data(force.nodes())
            .enter().append("circle").attr("r", 12).style("fill", function(d) {
                return color(d.group);
            }).attr("class", function(d) {
                return "nodes " + d.type;
            }).attr("id", function(d) {
                return "node_" + d.name;
            }).attr("clicked", "false").on("mouseover", mouseover).on(
                    "mouseout", mouseout).on("click", mouseclick).call(
                    force.drag);

    var text = svg.append("g").selectAll("text").data(force.nodes()).enter()
            .append("text").attr("x", 12).attr("id", function(d) {
                return "text_" + d.name;
            }).attr("y", ".31em").text(function(d) {
                return d.name;
            });

    var text_detailed = svg.append("g").selectAll("text").data(force.nodes())
            .enter().append("text").attr("x", 50).style("font-size", "0px")
            .attr("id", function(d) {
                return "detailed_" + d.name;
            }).attr("y", ".31em").text(function(d) {
                return (d.type);
            });

    // Use elliptical arc path segments to doubly-encode directionality.
    function tick() {
        path.attr("d", linkArc);
        circle.attr("transform", transform);
        text.attr("transform", transform);
        text_detailed.attr("transform", transform);
    }

    function linkArc(d) {
        var dx = d.target.x - d.source.x, dy = d.target.y - d.source.y, dr = Math
                .sqrt(dx * dx + dy * dy);
        return "M" + d.source.x + "," + d.source.y + "A" + dr + "," + dr
                + " 0 0,1 " + d.target.x + "," + d.target.y;
    }

    function transform(d) {
        return "translate(" + d.x + "," + d.y + ")";
    }

    function mouseover() {
        // if it is a circle
        var iface = d3.select(this).attr("id").split("_")
        if (iface.length > 1) {
            if (iface[0] == "node") {
                d3.select(this).transition().duration(250).attr("r", 24);
                d3.select("#text_" + iface[1]).style("font-size", "34px");
                d3.select("#detailed_" + iface[1]).style("font-size", "12px");
            }
        }
    }

    function mouseout() {
        var iface = d3.select(this).attr("id").split("_")
        if (iface.length > 1) {
            if (iface[0] == "node") {
                d3.select(this).transition().duration(250).attr("r", 12);
                d3.select("#text_" + iface[1]).style("font-size", "12px");
                d3.select("#detailed_" + iface[1]).style("font-size", "0px");
            }
        }
    }

    function mouseclick() {
        if (d3.select(this).attr("clicked") == "false") {
            d3.select(this).attr("clicked", "true");
            d3.select(this).style("fill", "yellow");
        } else {
            d3.select(this).attr("clicked", "false");
            var selectedNodeID = d3.select(this).attr("id");
            var iface = selectedNodeID.split("_");
            var groupnum = iface[1].split("-");
            d3.select(this).style("fill", color(groupnum[0]));
        }
    }
}

function resize_topology() {
    // give topology more room
    if (typeof self.jTopo !== "undefined") {
        var rect = document.getElementById("divTabs").getBoundingClientRect();
        var width = rect.width - 15
        var height = (rect.height - 50 - 5) - 15;
        if (height < 600) {
            height = 600;
        }
        drawTopology(self.jTopo, width, height);
    }
}

$(window).resize(function() {
    resize_topology();
});
