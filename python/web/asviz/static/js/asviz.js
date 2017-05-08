/*
 * Copyright 2017 ETH Zurich
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

window.onload = function() {
    // PANEL: Path Topology Graph
    // primary loading currently on index.html

    // PANEL: Path Data List
    setupPathSelection();
    setupListTree();

    // PANEL: AS Topology Graph
    drawAsTopo();

    // PANEL: AS Topology Data List
    document.getElementById("as-selection").innerHTML = "Click on a server";
}

function setupPathSelection() {
    // add path selection
    $("li").click(function() {
        var type = $(this).attr("seg-type");
        var num = $(this).attr("seg-num");
        if (this.className == "open") {
            console.log(type + num + ' clicked!');
            restorePath();
            drawPath(resFull, num, "purple");
            drawPath(resDown, 0, "red");
            drawPath(resUp, 0, "green");
        }
    });
}

function setupListTree() {
    // Handle open and close of data tree suggested
    // by J. Slegers at stackoverflow.com/questions/35467325
    var tree = document.querySelectorAll('ul.tree a:not(:last-child)');
    for (var i = 0; i < tree.length; i++) {
        tree[i].addEventListener('click', function(e) {
            var parent = e.target.parentElement;
            var classList = parent.classList;
            if (classList.contains("open")) {
                classList.remove('open');
                var opensubs = parent.querySelectorAll(':scope .open');
                for (var i = 0; i < opensubs.length; i++) {
                    opensubs[i].classList.remove('open');
                }
            } else {
                classList.add('open');
            }
        });
    }
}

function parseTopo(topo) {
    var data = {};
    data.links = topo.links.map(function(value) {
        var nodes = topo.nodes;
        var link = {};
        link.type = value.type || 'default';
        for (i = 0; i < nodes.length; i++) {
            if (nodes[i].name === value.source) {
                link.source = i;
            }
            if (nodes[i].name === value.target) {
                link.target = i;
            }
        }
        return link;
    });
    data.nodes = topo.nodes;
    return data;
};

function drawAsTopo() {
    var color = d3.scale.category20();
    var nodes = graph.nodes;
    var links = graph.links;

    var texts = svg.selectAll("text").data(nodes).enter().append("text").attr(
            "dy", 10 + 15).attr("text-anchor", "middle").attr("fill", "black")
            .attr("font-family", "sans-serif").attr("font-size", "14px").text(
                    function(d) {
                        return d.name;
                    });

    var force = d3.layout.force().nodes(nodes).links(links).size(
            [ width, height ]).charge(-700).gravity(0.1).friction(0.9)
            .linkDistance(50).start();

    var edges = svg.selectAll("line").data(links).enter().append("line").style(
            "stroke-linecap", "round").attr("class", function(d) {
        return "link " + d.type;
    }).attr("marker-end", "url(#end)");

    var nodes = svg.selectAll("circle").data(nodes).enter().append("circle")
            .attr("r", function(d) {
                return (d.type == "core") ? 125 : 10;
            }).on("click", onAsServerClick).attr("opacity", 0.5).style("fill",
                    function(d, i) {
                        return (d.type == "core") ? "none" : color(i);
                    }).style("stroke-width", function(d) {
                return (d.type == "core") ? 6 : 2;
            }).style("stroke", function(d, i) {
                return (d.type == "core") ? "gray" : color(i);
            }).call(force.drag);

    force.on("tick", function() {
        edges.attr("x1", function(d) {
            return d.source.x;
        }).attr("y1", function(d) {
            return d.source.y;
        }).attr("x2", function(d) {
            return d.target.x;
        }).attr("y2", function(d) {
            return d.target.y;
        });
        nodes.attr("cx", function(d) {
            return d.x;
        }).attr("cy", function(d) {
            return d.y;
        })
        texts.attr("transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
    });

}

var selectedServer;
function onAsServerClick(d) {
    ser_name = d.name;
    document.getElementById("as-selection").innerHTML = ser_name;

    // display node details
    console.log(d);
    $('#server_table tbody > tr').remove();
    var k;
    for (k in d) {
        if (typeof d[k] !== 'function') {
            $('#server_table').find('tbody').append(
                    "<tr><td>" + k + "</td><td>" + d[k] + "</td></tr>");
        }
    }

    if (d.type == "core") {
        return; // ignore core
    }

    if (!selectedServer) {
        selectedServer = this;
        d3.select(selectedServer).style('stroke', 'red');
    } else {
        d3.select(selectedServer).style('stroke', 'white');
        selectedServer = this;
        d3.select(selectedServer).style('stroke', 'red');
    }
}
