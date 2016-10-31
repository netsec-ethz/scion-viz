/*
 * Copyright 2016 ETH Zurich
 * 
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 * 
 * http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

var wv_map = null;

/**
 * Asynchronously notifies the Google Maps webview that the Google Maps API is
 * ready to be loaded and rendered for the first time.
 * 
 * @param isds
 *                A numeric array of ISD numbers used to render the map legend.
 */
function initGMap(isds) {
    wv_map = document.getElementById('g-map');
    console.log('got webview:', wv_map);

    wv_map.addEventListener("loadstart", function() {
        console.debug("webview loading...");
    });
    wv_map.addEventListener("contentload", function() {
        console.debug("webview content load done");
    });
    wv_map.addEventListener("loadstop", function() {
        console.debug("webview loading stopped");
    });

    if (wv_map) {
        wv_map.contentWindow.postMessage({
            command : {
                initMap : isds
            }
        }, "*");
    }
}

/**
 * Constructs a list of all possible and currently selected path topology
 * locations and asynchronously passes it to the Google Maps webview for updated
 * rendering of polylines.
 * 
 * @param path
 *                When undefined, no currently selected path will be displayed.
 */
function updateGMapAsLinks(res, path) {
    if (wv_map) {
        var all = getTopologyLinksAll();
        // update all paths
        wv_map.contentWindow.postMessage({
            command : {
                updateMapAsLinksAll : all
            }
        }, "*");

        var routes = [];
        if (typeof path !== "undefined") {
            routes = getPathSelectedLinks(res, path);
        }
        // update selected path
        wv_map.contentWindow.postMessage({
            command : {
                updateMapAsLinksPath : routes
            }
        }, "*");
    }
}

/**
 * Constructs a list of the location, co-location, and source/destination
 * properties of all AS markers and asynchronously passes it to the Google Maps
 * webview for updated rendering of symbolic markers.
 */
function updateGMapAsMarkers(src, dst) {
    var loc = getMarkerLocations(src, dst);

    if (wv_map) {
        wv_map.contentWindow.postMessage({
            command : {
                updateMapAsMarkers : loc
            }
        }, "*");
    }
}

/**
 * Constructs a list of all countries currently in the ISD Whitelist and
 * asynchronously passes it to the Google Maps webview for updated rendering of
 * fusion table polygons.
 */
function updateGMapIsdRegions(isds) {
    var countries = [];
    var isdAs;
    for (isdAs in self.jLoc) {
        var ifNum = isdAs.split('-');
        for (var i = 0; i < isds.length; i++) {
            if (isds[i] == "0" || isds[i] == ifNum[0]) {
                if (self.jLoc.hasOwnProperty(isdAs)) {
                    var iso2 = self.jLoc[isdAs];
                    countries.push(iso2);
                }
            }
        }
    }
    if (wv_map) {
        wv_map.contentWindow.postMessage({
            command : {
                updateMapIsdRegions : countries
            }
        }, "*");
    }
}
