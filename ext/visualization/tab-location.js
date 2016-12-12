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

var d_map = null;

/**
 * Synchronously initializes the Datamaps object with the Datamaps API and
 * renders map for the first time.
 * 
 * @param isds
 *                A numeric array of ISD numbers used to render the map legend.
 */
function initDMap(isds) {
    fillColors = getIsdFillColors(isds);
    d_map = new Datamap({
        scope : 'world',
        element : document.getElementById("d-map"),
        responsive : true,
        setProjection : getMapProjection(),
        fills : fillColors,
        bubblesConfig : {
            borderWidth : 1,
            borderOpacity : 1,
            borderColor : C_MAP_ISD_BRD,
            popupOnHover : true,
            radius : null,
            popupTemplate : getBubblePopupTemplate(),
            fillOpacity : 0.75,
            animate : true,
            highlightOnHover : true,
            exitDelay : 100,
        },
        arcConfig : {
            arcSharpness : 0.75,
            animationSpeed : 100,
            strokeColor : C_MAP_PATH_TOPO,
        },
        done : getFinishDrawAction()
    });
    d_map.legend({
        defaultFillName : 'No ISD:'
    });
}

function getIsdFillColors(isds) {
    var fills = {};
    fills.defaultFill = C_MAP_COUNDEF;
    fills["ISD Selected"] = C_MAP_COUN_SEL;
    fills["Route Selected"] = C_MAP_PATH_ACTIVE;
    fills["Route Path"] = C_MAP_PATH_TOPO;
    for (var i = 0; i < isds.length; i++) {
        fills["ISD-" + isds[i]] = C_MAP_ISDS[i];
    }
    return fills;
}

function getFinishDrawAction() {
    return function(datamap) {
        datamap.svg.call(d3.behavior.zoom().on("zoom", redraw));
        function redraw() {
            var prefix = '-webkit-transform' in document.body.style ? '-webkit-'
                    : '-moz-transform' in document.body.style ? '-moz-'
                            : '-ms-transform' in document.body.style ? '-ms-'
                                    : '';
            var x = d3.event.translate[0];
            var y = d3.event.translate[1];
            datamap.svg.selectAll("g").style(
                    prefix + 'transform',
                    'translate(' + x + 'px, ' + y + 'px) scale('
                            + (d3.event.scale) + ')');
        }
    };
}

function getBubblePopupTemplate() {
    return function(geography, data) {
        return '<div class="hoverinfo"><strong>' + data.name
                + '</strong></div>';
    };
}

/**
 * Set default zoom level determined by ASes.
 */
function getMapProjection(element) {
    return function(element) {
        var proj = getLatLngBoundedCenter(getAllGeocoordinates());
        console.log('center coordinates/scale', proj);
        var projection = d3.geo.mercator().center([ proj[1], proj[0] ]).rotate(
                [ 0, 0 ]).scale(proj[2]).translate(
                [ element.offsetWidth / 2, element.offsetHeight / 3 ]);
        var path = d3.geo.path().projection(projection);
        return {
            path : path,
            projection : projection
        };
    };
}

/**
 * Constructs a list of all possible and currently selected path topology
 * locations and asynchronously passes it to the Datamaps object for updated
 * rendering of the arcs.
 * 
 * @param path
 *                When undefined, no currently selected path will be displayed.
 */
function updateDMapAsLinks(res, path) {
    if (d_map) {
        var all = getTopologyLinksAll();

        if (typeof path !== "undefined") {
            // second add specific routes from selected path
            var routes = getPathSelectedLinks(res, path);
            all = all.concat(routes);
        }
        d_map.arc(all);
    }
}

/**
 * Constructs a list of the location, co-location, and source/destination
 * properties of all AS markers and synchronously passes it to the Datamaps
 * object for updated rendering of the bubbles used as markers.
 */
function updateDMapAsMarkers(src, dst) {
    if (d_map) {
        var loc = getMarkerLocations(src, dst);
        d_map.bubbles(loc);
    }
}

/**
 * Constructs a list of all countries currently in the ISD Whitelist and
 * synchronously passes it to the Datamaps object for updated rendering of the
 * choropleth.
 */
function updateDMapIsdRegions(isds) {
    if (d_map) {
        var countries = {};
        var isdAs;
        for (isdAs in self.jLoc) {
            var ifNum = isdAs.split('-');
            for (var i = 0; i < isds.length; i++) {
                if (isds[i] == "0" || isds[i] == ifNum[0]) {
                    if (self.jLoc.hasOwnProperty(isdAs)) {
                        var iso2 = self.jLoc[isdAs];
                        // find 3-loc code based on 2-loc code
                        if (iso3.hasOwnProperty(iso2)) {
                            countries[iso3[iso2]] = {
                                fillKey : "ISD Selected",
                            };
                        }
                    }
                }
            }
        }
        d_map.updateChoropleth(countries, {
            reset : true
        });
    }
}
