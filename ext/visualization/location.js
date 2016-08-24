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

var C_MAP_COUNDEF = '#EEEEEE';
var C_MAP_COUN = '#3366CC';
var C_MAP_COUN_SEL = '#CCCCCC';
var C_MAP_PATH_TOPO = '#999999';
var C_MAP_PATH_ACTIVE = '#FF0000';
var C_MAP_ISD_BRD = '#FFFFFF';

var C_MAP_ISDS = [ '#0099FF', '#FF9900', '#FF0099', '#9900FF', '#00FF99',
        '#99FF00' ];

function sortFloat(a, b) {
    return a - b;
}

/**
 * Return the coordinates of all ASes.
 */
function getAllGeocoordinates() {
    var loc = [];
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        if (self.jLoc.hasOwnProperty(isdAs)) {
            var coord = [ latlong[self.jLoc[isdAs]][0],
                    latlong[self.jLoc[isdAs]][1] ];
            loc.push(coord);
        }
    }
    console.log('all coordinates', loc);
    return loc;
}

/**
 * Calculate bounded center of a set of coordinates.
 */
function getLatLngBoundedCenter(latLngInDegr) {
    var lats = [];
    var lngs = [];
    for (var i = 0; i < latLngInDegr.length; i++) {
        lats.push(parseFloat(latLngInDegr[i][0]));
        lngs.push(parseFloat(latLngInDegr[i][1]));
    }
    lats.sort(sortFloat);
    lngs.sort(sortFloat);

    // calc TB diff, and BT diff, find center
    var latTop = lats[latLngInDegr.length - 1];
    var latBot = lats[0];
    var b2t = Math.abs(latTop - latBot);
    var lat = latBot + (b2t / 2);

    // calc LR diff, and RL diff, find center
    var lngRgt = lngs[latLngInDegr.length - 1];
    var lngLft = lngs[0];
    var l2r = Math.abs(lngRgt - lngLft);
    var lng = lngLft + (l2r / 2);

    // lat is flush in window, so add 1/3 margin
    var latScale = 180 / b2t * 100 * 0.67;
    // long is already short in window, do not add margin
    var lngScale = 360 / l2r * 100;

    // scale, use least scale to show most map
    var scale = latScale < lngScale ? latScale : lngScale;

    return [ lat, lng, scale ];
}

/**
 * Find all possible routes from topology, returns map coordinates.
 */
function getTopologyLinksAll() {
    // first
    var arcs = [];
    for (var p = 0; p < self.jTopo.length; p++) {
        // we want all ISD-ASes from each A to B link possible
        var isdAsA = self.jLoc[self.jTopo[p].a];
        var isdAsB = self.jLoc[self.jTopo[p].b];
        if (isdAsA == isdAsB) {
            // skip internal routing when making arcs
            continue;
        }
        // find lat long
        var arc = {
            origin : {
                latitude : latlong[isdAsA][0],
                longitude : latlong[isdAsA][1]
            },
            destination : {
                latitude : latlong[isdAsB][0],
                longitude : latlong[isdAsB][1]
            },
            options : {
                strokeColor : C_MAP_PATH_TOPO
            },
        };
        arcs.push(arc);
    }
    return arcs;
}

/**
 * Find only the currently selected path, returns map coordinates..
 */
function getPathSelectedLinks(res, path) {
    var arcs = [];
    var routes = [];
    if (path < 0) {
        for (var i = 0; i < res.if_lists.length; i++) {
            routes.push(i);
        }
    } else {
        routes.push(path);
    }
    for (var p = 0; p < routes.length; p++) {
        var pNum = parseInt(routes[p]);
        for (var ifNum = 0; ifNum < (res.if_lists[pNum].length - 1); ifNum++) {
            // we want all ISD-ASes from each interface path traversed
            var iface = res.if_lists[pNum][ifNum];
            var ifaceNext = res.if_lists[pNum][ifNum + 1];
            var isdAsA = self.jLoc[iface.ISD + '-' + iface.AS];
            var isdAsB = self.jLoc[ifaceNext.ISD + '-' + ifaceNext.AS];
            if (isdAsA == isdAsB) {
                // skip internal routing when making arcs
                continue;
            }
            // find lat long
            var arc = {
                origin : {
                    latitude : latlong[isdAsA][0],
                    longitude : latlong[isdAsA][1]
                },
                destination : {
                    latitude : latlong[isdAsB][0],
                    longitude : latlong[isdAsB][1]
                },
                options : {
                    strokeColor : C_MAP_PATH_ACTIVE
                },
            };
            arcs.push(arc);
        }
    }
    return arcs;
}

/**
 * Find marker locations of all ASes with special notes for source/destination.
 */
function getMarkerLocations(src, dst) {
    var loc = [];
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        if (self.jLoc.hasOwnProperty(isdAs)) {
            label = '', marker = '', rad = 4;
            if (src != null && isdAs == src) {
                label = " (source)";
                marker = 'S';
                rad = 8;
            } else if (dst != null && isdAs == dst) {
                label = " (destination)";
                marker = 'D';
                rad = 8;
            }
            var bubble = {
                name : isdAs + label,
                marker : marker,
                latitude : latlong[self.jLoc[isdAs]][0],
                longitude : latlong[self.jLoc[isdAs]][1],
                radius : rad,
                fillKey : "ISD-" + ifNum[0],
            };
            loc.push(bubble);
        }
    }
    // combine ISD locations that share geo-location
    // sort by location, then name
    loc.sort(function(a, b) {
        if (a.longitude === b.longitude) {
            return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        }
        return (a.longitude) - (b.longitude);
    })
    for (i = 0; i < loc.length; ++i) {
        if ((i + 1) < loc.length && loc[i].longitude === loc[i + 1].longitude
                && loc[i].latitude === loc[i + 1].latitude) {
            // remove and add to previous
            loc[i + 1].name = loc[i].name + ', ' + loc[i + 1].name;
            loc[i + 1].marker = loc[i].marker + loc[i + 1].marker;
            if (loc[i].radius > loc[i + 1].radius) {
                loc[i + 1].radius = loc[i].radius;
            }
            loc.splice(i--, 1);
        }
    }
    return loc;
}
