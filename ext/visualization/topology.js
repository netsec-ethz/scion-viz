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

var nodes = new Array(); // for the nodes in topology

var linksSource = new Array(); // for the edges(links) in topology
var linksTarget = new Array();
var linksValue = new Array();

var core_as_nodes = new Array();

var highlighted_path_ID = [];

var graph;
var color;
var d3cola;
var svg;

var typeRouting = 'ROUTING';
var typeParent = 'PARENT';
var typePeer = 'PEER';
var typeChild = 'CHILD';

// 160315 yskim added for the final integration
function lookupLinks(source, target) {
    var res = -1;
    for (var i = 0; i < linksSource.length; i++) {
        if (source == nodes[linksSource[i]]) {
            if (target == nodes[linksTarget[i]]) {
                res = i;
            }
        }
    }
    return res;
}

function lookupNodes(name) {
    var res = -1;
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] == name) {
            res = i;
        }
    }
    return res;
}

function getGroupNumber(name, core) {
    var iface = name.split("-");
    var group = ((parseInt(iface[0]) - 1) * 4) + core;
    console.log(name + " group " + group);
    return group;
}

function buildIdsJsonString() {
    var string;
    for (var i = 0; i < nodes.length; i++) {
        if (i == 0) {
            string = '"' + nodes[i] + '" : ' + i;
        } else {
            string = string + ',"' + nodes[i] + '" : ' + i;
        }
    }
    return '"ids":{' + string + '}';
}

function buildNodeJsonString() {
    var string;
    for (var i = 0; i < nodes.length; i++) {
        var core = (core_as_nodes[i] == typeRouting) ? 0 : 1;
        if (i == 0) {
            string = '{"name":"' + nodes[i] + '","group":'
                    + getGroupNumber(nodes[i], core) + ', "type":"'
                    + core_as_nodes[i] + '"}';
        } else {
            string = string + ',{"name":"' + nodes[i] + '","group":'
                    + getGroupNumber(nodes[i], core) + ', "type":"'
                    + core_as_nodes[i] + '"}';
        }
    }
    return '"nodes":[' + string + ']';
}

function buildLinkJsonString() {
    var string;
    for (var i = 0; i < linksSource.length; i++) {
        if (i == 0) {
            string = '{"source":' + linksSource[i] + ',"target":'
                    + linksTarget[i] + ',"type":"' + linksValue[i] + '"}';
        } else {
            string = string + ',{"source":' + linksSource[i] + ',"target":'
                    + linksTarget[i] + ',"type": "' + linksValue[i] + '"}';
        }
    }
    return '"links":[' + string + ']';
}

function createGraphJson(original_json_data) {
    nodes = new Array();
    linksSource = new Array();
    linksTarget = new Array();
    linksValue = new Array();
    core_as_nodes = new Array();
    highlighted_path_ID = [];

    // sort for optimal color coding display
    original_json_data.sort(function(a, b) {
        var isdA = a.b.split('-')[0];
        var isdB = b.b.split('-')[0];
        var asA = a.b.split('-')[1];
        var asB = b.b.split('-')[1];
        var coreA = (a.ltype == typeRouting) ? 0 : 1;
        var coreB = (b.ltype == typeRouting) ? 0 : 1;
        if (isdA < isdB)
            return -1;
        if (isdA > isdB)
            return 1;
        if (coreA < coreB)
            return -1;
        if (coreA > coreB)
            return 1;
        if (asA < asB)
            return -1;
        if (asA > asB)
            return 1;
        return 0;
    });

    // make node structure first
    for (var i = 0; i < original_json_data.length; i++) {
        // read a and b, and put them into the Array node
        // if there is not, then I'll push that the queue, if there is, then i
        // can get its index through lookup function
        if (lookupNodes(original_json_data[i].a) == -1) {
            nodes.push(original_json_data[i].a);
            core_as_nodes.push(original_json_data[i].ltype);
        }
        if (lookupNodes(original_json_data[i].b) == -1) {
            nodes.push(original_json_data[i].b);
            core_as_nodes.push(original_json_data[i].ltype);
        }
    }

    // for the link structure. they already have link structure, so re-merge it
    // into easiest way to render
    for (var i = 0; i < original_json_data.length; i++) {
        linksSource.push(lookupNodes(original_json_data[i].a));
        linksTarget.push(lookupNodes(original_json_data[i].b));
        linksValue.push(original_json_data[i].ltype);
    }

    // merge, and make a complete json chunk
    return '{' + buildNodeJsonString() + ',' + buildLinkJsonString() + ','
            + buildIdsJsonString() + '}';
}

/**
 * retrieve given ID because the link will consist of source-target. or
 * target-source,
 */
function getPathId(source, target) {
    var res = 'null';

    // search source - target
    for (var i = 0; i < graph.links.length; i++) {
        if (graph.links[i].source.name == source) {
            if (graph.links[i].target.name == target) {
                res = "source_" + source + "_target_" + target;
            }
        }
    }

    // and target - source
    for (var j = 0; j < graph.links.length; j++) {
        if (graph.links[j].target.name == source) {
            if (graph.links[j].source.name == target) {
                res = "source_" + target + "_target_" + source;
            }
        }
    }
    return res;
}

function convertData(topology) {
    var graph = {
        nodes : [],
        links : [],
        ids : {}
    };

    var i = 0;

    var ISDAS = new RegExp("^[0-9]*-[0-9]*$");
    var ISD = new RegExp("^[0-9]*");
    var AS = new RegExp("[0-9]*$");

    for ( var key in topology) {
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

    for ( var source in topology) {
        if (ISDAS.test(source)) {
            for ( var target in topology[source]["links"]) {
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
