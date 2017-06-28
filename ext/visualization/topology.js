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

var typeCore = 'CORE';
var typeParent = 'PARENT';
var typePeer = 'PEER';
var typeChild = 'CHILD';

var ISDAS = new RegExp("^[0-9]*-[0-9]*$");
var ISD = new RegExp("^[0-9]*");
var AS = new RegExp("[0-9]*$");

/**
 * retrieve given ID because the link will consist of source-target. or
 * target-source,
 */
function getPathId(source, target) {
    var res = 'null';

    // search source - target
    for (var i = 0; i < graphPath.links.length; i++) {
        if (graphPath.links[i].source.name == source) {
            if (graphPath.links[i].target.name == target) {
                res = "source_" + source + "_target_" + target;
            }
        }
    }

    // and target - source
    for (var j = 0; j < graphPath.links.length; j++) {
        if (graphPath.links[j].target.name == source) {
            if (graphPath.links[j].source.name == target) {
                res = "source_" + target + "_target_" + source;
            }
        }
    }
    return res;
}

function addPlaceholderNode(graph, n, core) {
    var name = ((n + 1) + "-" + (n + 100 + core));
    var group = ((ISD.exec(name) - 1) * 4) + core;
    graph["nodes"].push({
        name : name,
        group : group,
        type : "placeholder"
    });
}

function sortTopologyGraph(graph) {
    // add placeholder nodes for consistent coloring
    var maxIsd = 0;
    for (var n = 0; n < graph.nodes.length; n++) {
        var isd = ISD.exec(graph.nodes[n].name);
        if (isd > maxIsd) {
            maxIsd = isd;
        }
    }
    for (var n = 0; n < maxIsd; n++) {
        addPlaceholderNode(graph, n, 0);
        addPlaceholderNode(graph, n, 1);
    }
    // sort for optimal color coding display
    graph.nodes.sort(function(a, b) {
        var ph = (a.type != "placeholder") - (b.type != "placeholder");
        if (ph == 0) {
            var isd = ISD.exec(a.name) - ISD.exec(b.name);
            if (isd == 0) {
                var core = (a.type != typeCore) - (b.type != typeCore);
                if (core == 0) {
                    var as = AS.exec(a.type) - AS.exec(b.type);
                    if (as == 0) {
                        return 0;
                    }
                    return as;
                }
                return core;
            }
            return isd;
        }
        return ph;
    });
    // adjust indexes to match
    for (var n = 0; n < graph.nodes.length; n++) {
        graph.ids[graph.nodes[n].name] = n;
    }
}

function addNodeFromLink(graph, name, type, node) {
    var core = (type.toLowerCase() == "core") ? 1 : 0; // TODO mwfarb unhack
    var group = ((ISD.exec(name) - 1) * 4) + core;
    graph["nodes"].push({
        name : name,
        group : group,
        type : type
    });
    graph["ids"][name] = node;
}

function convertLinks2Graph(links_topo) {
    var graph = {
        nodes : [],
        links : [],
        ids : {}
    };
    var node = 0;
    for (var i = 0; i < links_topo.length; i++) {
        if (!(links_topo[i].a in graph["ids"])) {
            addNodeFromLink(graph, links_topo[i].a, links_topo[i].ltype, node);
            node++;
        }
        if (!(links_topo[i].b in graph["ids"])) {
            addNodeFromLink(graph, links_topo[i].b, links_topo[i].ltype, node);
            node++;
        }
    }
    sortTopologyGraph(graph);
    for (var i = 0; i < links_topo.length; i++) {
        if (links_topo[i].a != links_topo[i].b) {
            graph["links"].push({
                source : graph["ids"][links_topo[i].a],
                target : graph["ids"][links_topo[i].b],
                type : links_topo[i].ltype
            });
        }
    }
    return graph;
}

function convertTopo2Graph(topology) {
    var graph = {
        nodes : [],
        links : [],
        ids : {}
    };
    var i = 0;
    var key;
    for (key in topology) {
        if (ISDAS.test(key)) {
            var type = topology[key]["level"].toLowerCase();
            var core = (type == "core") ? 0 : 1;
            var group = ((ISD.exec(key) - 1) * 4) + core;

            graph["nodes"].push({
                name : key,
                group : group,
                type : type
            });
            graph["ids"][key] = i;
            i++;
        }
    }
    sortTopologyGraph(graph);
    var source;
    for (source in topology) {
        if (ISDAS.test(source)) {
            var target;
            for (target in topology[source]["links"]) {
                graph["links"].push({
                    source : graph["ids"][source],
                    target : graph["ids"][target],
                    type : "normal"
                });
            }
        }
    }
    return graph;
}
