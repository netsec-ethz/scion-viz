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

var kBaseIndex = 0;
var kBaseIndexSel = 0;
var kBaseUrlSel = null;
var backgroundJobs = [];

// D3 simple table...

var rStat = function(name, arr) {
    var row = {};
    row.name = name;
    for (var i = 0; i < arr.length; i++) {
        row["path" + i] = arr[i];
    }
    return row;
};

function renderStatsHeader(index, hRow) {
    var thead = d3.select(".urlStatsWidget").select('[id="' + index + '"]')
            .select('thead');
    var rows = thead.selectAll("tr").data([ hRow ], function(d) {
        return d.name;
    });
    rows.enter().append("tr");
    rows.order();
    var cells = rows.selectAll("th").data(function(row) {
        var cols = [];

        cols.push({
            column : '-1',
            value : row.name
        });
        var i = 0;
        while (row.hasOwnProperty("path" + i)) {
            cols.push({
                column : i,
                value : row["path" + i]
            });
            i++;
        }
        return cols;
    });
    // Create accurate list of paths radio buttons
    cells.enter().append("th").append('label').html(function(d) {
        return d.value;
    }).append('input').attr('name', 'radioPath').attr('type', 'radio').attr(
            'value', function(d) {
                return (d.column).toString();
            });
    cells.exit().remove();
    rows.exit().remove();
}

function renderStatsBody(index) {
    var tbody = d3.select(".urlStatsWidget").select('[id="' + index + '"]')
            .select('tbody');
    var rows = tbody.selectAll("tr").data(backgroundJobs, function(d) {
        return d.name;
    });
    rows.enter().append("tr");
    rows.order();
    var cells = rows.selectAll("td").data(function(row) {
        var cols = [];
        cols.push({
            column : 'Name',
            value : row.name
        });
        var i = 0;
        while (row.hasOwnProperty("path" + i)) {
            cols.push({
                column : i,
                value : row["path" + i]
            });
            i++;
        }
        return cols;
    });
    cells.enter().append("td");
    cells.text(function(d) {
        return d.value;
    });
    cells.exit().remove();
    rows.exit().remove();
}

function getInterfaceListRows(res) {
    var rows = [];
    var ifNum = 0;
    var found = true;
    var max_count = Math.max.apply(null, res.if_counts);
    do {
        var row = [];
        for (var i = 0; i < res.if_lists.length; i++) {
            if (ifNum < res.if_counts[i]) {
                var ifRes = res.if_lists[i][ifNum];
                row.push(ifRes.ISD + '-' + ifRes.AS + ' (' + ifRes.IFID + ')');
            } else {
                row.push('-');
            }
        }
        rows.push(rStat('Interface ' + (ifNum + 1), (row ? row : '-')));
        ifNum++;
    } while (ifNum < max_count);
    return rows;
}

function sortAccordion() {
    // Get an array of jQuery objects containing each h3 and the div
    // that follows it
    var entries = $.map($(".urlStatsWidget").children("h3").get(), function(
            entry) {
        var $entry = $(entry);
        return $entry.add($entry.next());
    });

    // Sort the array by the h3's text
    entries.sort(function(a, b) {
        return a.filter("h3").text().localeCompare(b.filter("h3").text());
    });

    // Put them in the right order in the container
    $.each(entries, function() {
        this.detach().appendTo($(".urlStatsWidget"));
    });
}

function addUrlToAccordion(httpReq) {
    var header;
    if (httpReq.length == 2) {
        // expecting (method, path)
        header = httpReq[0] + " " + httpReq[1] + " " + "ID_MISSING";
    } else if (httpReq.length == 3) {
        // expecting (conn_id, method, path)
        header = httpReq[1] + " " + httpReq[2] + " " + httpReq[0];
    } else {
        console.error("Unexpected LIST element length = " + httpReq.length);
        return;
    }
    $(function() {
        // determine which elements are new
        var foundin = $('body:contains("' + header + '")');
        if (!foundin.length) {
            // add urls to widget
            var newDiv = "<h3>" + header + "</h3><div id='" + kBaseIndex
                    + "' >"
                    + "<table><thead></thead><tbody></tbody></table></div>";
            $(".urlStatsWidget").append(newDiv)
            $(".urlStatsWidget").accordion("refresh");
            kBaseIndex++;
        }
    });
}

function removeAllFromAccordion() {
    // clear the contents
    $(".urlStatsWidget").empty();
}

$(function() {
    // initialize URL accordion widget
    $(".urlStatsWidget").accordion({
        autoHeight : false,
        collapsible : true,
        active : false,
        heightStyle : "content",
        animate : 300,
        activate : function(event, ui) {
        }
    }).sortable({
        axis : "y",
        handle : "h3",
        sorting : true,
        stop : function() {
            stop = true;
        }
    });
    $(".urlStatsWidget").on("accordionactivate", function(event, ui) {
        if (ui.newHeader.length && ui.newPanel.length) {
            // accordion is expanding, udp lookup
            kBaseUrlSel = ui.newHeader[0].innerText;
            kBaseIndexSel = ui.newPanel.attr('id');
            console.log("activate init event: " + kBaseIndexSel);
            requestLookup();
        } else {
            // when closing accordion clean path selection, keep bubbles
            map.arc(updateMapIsdAsArc());
            restorePath();
        }
    });
});
