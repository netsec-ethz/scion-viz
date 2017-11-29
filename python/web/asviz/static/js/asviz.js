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

var selectedServer;
var colorServerSelect = "black";
var colorServerDeselect = "gray";
var colorPaths = "black";
var colorSegCore = "red";
var colorSegUp = "green";
var colorSegDown = "blue";

// AS Topology Graph
var sv_link_dist = 75; // link distance
var ft_h = 14; // font height
var sv_tx_dy = 25; // server node label y-offset
var as_r = 130; // AS node radius
var sv_r = 11; // server node radius
var as_st = 6; // AS node stroke
var sv_st = 2; // server node stroke

/*
 * Focuses the active tab to the tab label.
 */
function activateTab(tab) {
    $('.tab-pane a[href="#' + tab + '"]').tab('show');
};

/*
 * Returns the tab label of the active tab
 */
function getTab() {
    return $("ul#sampleTabs li.active")
}

window.onload = function() {
    // PANEL: Path Topology Graph
    // primary loading currently on index.html

    // PANEL: Path Data List
    setupPathSelection();
    setupListTree();

    // PANEL: AS Topology Graph
    // primary loading currently on index.html

    // PANEL: AS Topology Data List
    document.getElementById("as-selection").innerHTML = "Click on a server";
}

/*
 * Creates on-click handler that will draw/hide selected path arcs.
 */
function setupPathSelection() {
    // add style to list of paths and segments
    $('li[seg-type="CORE"]').children().css("color", colorSegCore);
    $('li[seg-type="DOWN"]').children().css("color", colorSegDown);
    $('li[seg-type="UP"]').children().css("color", colorSegUp);
    $('li[seg-type="PATH"]').children().css("color", colorPaths);

    // handle path graph-only selection and color
    $("#as-iflist > ul > li").click(function() {
        var type = $(this).attr("seg-type");
        var idx = parseInt($(this).attr("seg-num"));
        if (this.className == "open") {
            console.log(type + idx + ' opened');
            var num = idx + 1;
            if (type == 'CORE') {
                drawPath(resCore, idx, colorSegCore);
                drawTitle(type + ' SEGMENT ' + num, colorSegCore,
                        resCore.if_lists[idx].expTime);
            } else if (type == 'DOWN') {
                drawPath(resDown, idx, colorSegDown);
                drawTitle(type + ' SEGMENT ' + num, colorSegDown,
                        resDown.if_lists[idx].expTime);
            } else if (type == 'UP') {
                drawPath(resUp, idx, colorSegUp);
                drawTitle(type + ' SEGMENT ' + num, colorSegUp,
                        resUp.if_lists[idx].expTime);
            } else if (type == 'PATH') {
                drawPath(resPath, idx, colorPaths);
                drawTitle(type + ' ' + num, colorPaths);
            }
        } else {
            console.log(type + idx + ' closed');
            restorePath();
            removeTitle();
        }
    });
}

/*
 * Handle open and close of data tree suggested by J. Slegers at
 * stackoverflow.com/a/36297526
 */
function setupListTree() {
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

/*
 * Translates incoming AS topology data to D3-compatible json.
 */
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

/*
 * Initializes AS topology graph, its handlers, and renders it.
 */
function drawAsTopo(div_id, json_as_topo, width, height) {

    var graphAs = parseTopo(json_as_topo);
    console.log(JSON.stringify(graphAs));

    var svgAs = d3.select("#" + div_id).append("svg").attr("height", height)
            .attr("width", width);

    var color = d3.scale.category10();
    var nodes = graphAs.nodes;
    var links = graphAs.links;

    var texts = svgAs.selectAll("text").data(nodes).enter().append("text")
            .attr("dy", sv_tx_dy).attr("text-anchor", "middle").attr("fill",
                    "black").attr("font-family", "sans-serif").attr(
                    "font-size", ft_h + "px").text(function(d) {
                return d.name;
            });

    var colaAs = cola.d3adaptor().size([ width, height ]).linkDistance(
            sv_link_dist).avoidOverlaps(true);
    colaAs.nodes(nodes).links(links).start(30)

    var edges = svgAs.selectAll("line").data(links).enter().append("line")
            .style("stroke-linecap", "round").attr("class", function(d) {
                return "link " + d.type;
            }).attr("marker-end", "url(#end)");

    var nodes = svgAs.selectAll("circle").data(nodes).enter().append("circle")
            .attr("r", function(d) {
                return (d.type == "root") ? as_r : sv_r - 1;
            }).on("click", onAsServerClick).attr("opacity", function(d) {
                return 0.5;
            }).style("fill", function(d, i) {
                return (d.type == "root") ? "none" : color(d.group);
            }).style("stroke-width", function(d) {
                return (d.type == "root") ? as_st : sv_st;
            }).style("stroke", function(d) {
                return colorServerDeselect;
            }).call(colaAs.drag);

    colaAs.on("tick", function() {

        edges.attr("x1", function(d) {
            return Math.max(sv_r, Math.min(width - sv_r, d.source.x));
        }).attr("y1", function(d) {
            return Math.max(sv_r, Math.min(height - sv_r - ft_h, d.source.y));
        }).attr("x2", function(d) {
            return Math.max(sv_r, Math.min(width - sv_r, d.target.x));
        }).attr("y2", function(d) {
            return Math.max(sv_r, Math.min(height - sv_r - ft_h, d.target.y));
        });

        nodes.attr("cx", function(d) {
            return d.x = Math.max(sv_r, Math.min(width - sv_r, d.x));
        }).attr("cy", function(d) {
            return d.y = Math.max(sv_r, Math.min(height - sv_r - ft_h, d.y));
        });

        texts.attr("transform", function(d) {
            return "translate(" + d.x + "," + d.y + ")";
        });
    });
}

/*
 * Creates handler to display AS topology server details per-click.
 */
function onAsServerClick(d) {
    ser_name = d.name;
    document.getElementById("as-selection").innerHTML = ser_name;

    // display node details
    console.log(d);
    $('#server_table tbody > tr').remove();
    var k;
    var graph_vars = [ 'x', 'y', 'px', 'py', 'fixed', 'weight', 'index',
            'group', 'variable', 'bounds' ];
    for (k in d) {
        if (typeof d[k] !== 'function' && !graph_vars.includes(k)) {
            $('#server_table').find('tbody').append(
                    "<tr><td>" + k + "</td><td>" + d[k] + "</td></tr>");
        }
    }
    // allow root AS and all servers to be highlighted
    if (!selectedServer) {
        selectedServer = this;
        updateNodeSelected(true, selectedServer);
    } else {
        updateNodeSelected(false, selectedServer);
        selectedServer = this;
        updateNodeSelected(true, selectedServer);
    }
}

/*
 * Maintains highlight status for selected server nodes.
 */
function updateNodeSelected(isSelected, selected) {
    d3.select(selected).style('stroke',
            isSelected ? colorServerSelect : colorServerDeselect);
    d3.select(selected).attr('opacity', isSelected ? 1 : 0.5);
}
