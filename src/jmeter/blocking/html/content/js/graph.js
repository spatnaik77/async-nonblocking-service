/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 19800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 19800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 8.0, "minX": 0.0, "maxY": 1649.0, "series": [{"data": [[0.0, 8.0], [0.1, 301.0], [0.2, 302.0], [0.3, 303.0], [0.4, 306.0], [0.5, 335.0], [0.6, 373.0], [0.7, 412.0], [0.8, 452.0], [0.9, 492.0], [1.0, 533.0], [1.1, 572.0], [1.2, 608.0], [1.3, 647.0], [1.4, 685.0], [1.5, 726.0], [1.6, 765.0], [1.7, 806.0], [1.8, 847.0], [1.9, 886.0], [2.0, 917.0], [2.1, 958.0], [2.2, 998.0], [2.3, 1038.0], [2.4, 1076.0], [2.5, 1120.0], [2.6, 1153.0], [2.7, 1198.0], [2.8, 1231.0], [2.9, 1274.0], [3.0, 1312.0], [3.1, 1354.0], [3.2, 1390.0], [3.3, 1401.0], [3.4, 1410.0], [3.5, 1416.0], [3.6, 1420.0], [3.7, 1423.0], [3.8, 1425.0], [3.9, 1427.0], [4.0, 1429.0], [4.1, 1430.0], [4.2, 1432.0], [4.3, 1434.0], [4.4, 1436.0], [4.5, 1438.0], [4.6, 1439.0], [4.7, 1441.0], [4.8, 1443.0], [4.9, 1445.0], [5.0, 1447.0], [5.1, 1448.0], [5.2, 1450.0], [5.3, 1452.0], [5.4, 1453.0], [5.5, 1454.0], [5.6, 1455.0], [5.7, 1457.0], [5.8, 1458.0], [5.9, 1459.0], [6.0, 1460.0], [6.1, 1461.0], [6.2, 1462.0], [6.3, 1463.0], [6.4, 1464.0], [6.5, 1466.0], [6.6, 1467.0], [6.7, 1468.0], [6.8, 1470.0], [6.9, 1471.0], [7.0, 1472.0], [7.1, 1473.0], [7.2, 1474.0], [7.3, 1476.0], [7.4, 1477.0], [7.5, 1478.0], [7.6, 1479.0], [7.7, 1480.0], [7.8, 1481.0], [7.9, 1482.0], [8.0, 1484.0], [8.1, 1484.0], [8.2, 1485.0], [8.3, 1486.0], [8.4, 1488.0], [8.5, 1489.0], [8.6, 1491.0], [8.7, 1493.0], [8.8, 1493.0], [8.9, 1494.0], [9.0, 1496.0], [9.1, 1497.0], [9.2, 1498.0], [9.3, 1498.0], [9.4, 1499.0], [9.5, 1500.0], [9.6, 1501.0], [9.7, 1502.0], [9.8, 1503.0], [9.9, 1504.0], [10.0, 1505.0], [10.1, 1505.0], [10.2, 1506.0], [10.3, 1506.0], [10.4, 1507.0], [10.5, 1507.0], [10.6, 1507.0], [10.7, 1507.0], [10.8, 1508.0], [10.9, 1508.0], [11.0, 1508.0], [11.1, 1508.0], [11.2, 1508.0], [11.3, 1508.0], [11.4, 1509.0], [11.5, 1509.0], [11.6, 1509.0], [11.7, 1509.0], [11.8, 1509.0], [11.9, 1509.0], [12.0, 1509.0], [12.1, 1509.0], [12.2, 1509.0], [12.3, 1509.0], [12.4, 1509.0], [12.5, 1510.0], [12.6, 1510.0], [12.7, 1510.0], [12.8, 1510.0], [12.9, 1510.0], [13.0, 1510.0], [13.1, 1510.0], [13.2, 1510.0], [13.3, 1510.0], [13.4, 1510.0], [13.5, 1510.0], [13.6, 1510.0], [13.7, 1510.0], [13.8, 1510.0], [13.9, 1510.0], [14.0, 1510.0], [14.1, 1511.0], [14.2, 1511.0], [14.3, 1511.0], [14.4, 1511.0], [14.5, 1511.0], [14.6, 1511.0], [14.7, 1511.0], [14.8, 1511.0], [14.9, 1511.0], [15.0, 1511.0], [15.1, 1511.0], [15.2, 1511.0], [15.3, 1511.0], [15.4, 1511.0], [15.5, 1511.0], [15.6, 1511.0], [15.7, 1511.0], [15.8, 1511.0], [15.9, 1511.0], [16.0, 1511.0], [16.1, 1511.0], [16.2, 1511.0], [16.3, 1512.0], [16.4, 1512.0], [16.5, 1512.0], [16.6, 1512.0], [16.7, 1512.0], [16.8, 1512.0], [16.9, 1512.0], [17.0, 1512.0], [17.1, 1512.0], [17.2, 1512.0], [17.3, 1512.0], [17.4, 1512.0], [17.5, 1512.0], [17.6, 1512.0], [17.7, 1512.0], [17.8, 1512.0], [17.9, 1512.0], [18.0, 1512.0], [18.1, 1512.0], [18.2, 1512.0], [18.3, 1512.0], [18.4, 1512.0], [18.5, 1512.0], [18.6, 1512.0], [18.7, 1512.0], [18.8, 1512.0], [18.9, 1512.0], [19.0, 1512.0], [19.1, 1512.0], [19.2, 1512.0], [19.3, 1512.0], [19.4, 1512.0], [19.5, 1512.0], [19.6, 1512.0], [19.7, 1513.0], [19.8, 1513.0], [19.9, 1513.0], [20.0, 1513.0], [20.1, 1513.0], [20.2, 1513.0], [20.3, 1513.0], [20.4, 1513.0], [20.5, 1513.0], [20.6, 1513.0], [20.7, 1513.0], [20.8, 1513.0], [20.9, 1513.0], [21.0, 1513.0], [21.1, 1513.0], [21.2, 1513.0], [21.3, 1513.0], [21.4, 1513.0], [21.5, 1513.0], [21.6, 1513.0], [21.7, 1513.0], [21.8, 1513.0], [21.9, 1513.0], [22.0, 1513.0], [22.1, 1513.0], [22.2, 1513.0], [22.3, 1513.0], [22.4, 1513.0], [22.5, 1513.0], [22.6, 1513.0], [22.7, 1513.0], [22.8, 1513.0], [22.9, 1513.0], [23.0, 1513.0], [23.1, 1513.0], [23.2, 1513.0], [23.3, 1513.0], [23.4, 1513.0], [23.5, 1513.0], [23.6, 1513.0], [23.7, 1513.0], [23.8, 1513.0], [23.9, 1513.0], [24.0, 1513.0], [24.1, 1514.0], [24.2, 1514.0], [24.3, 1514.0], [24.4, 1514.0], [24.5, 1514.0], [24.6, 1514.0], [24.7, 1514.0], [24.8, 1514.0], [24.9, 1514.0], [25.0, 1514.0], [25.1, 1514.0], [25.2, 1514.0], [25.3, 1514.0], [25.4, 1514.0], [25.5, 1514.0], [25.6, 1514.0], [25.7, 1514.0], [25.8, 1514.0], [25.9, 1514.0], [26.0, 1514.0], [26.1, 1514.0], [26.2, 1514.0], [26.3, 1514.0], [26.4, 1514.0], [26.5, 1514.0], [26.6, 1514.0], [26.7, 1514.0], [26.8, 1514.0], [26.9, 1514.0], [27.0, 1514.0], [27.1, 1514.0], [27.2, 1514.0], [27.3, 1514.0], [27.4, 1514.0], [27.5, 1514.0], [27.6, 1514.0], [27.7, 1514.0], [27.8, 1514.0], [27.9, 1514.0], [28.0, 1514.0], [28.1, 1514.0], [28.2, 1514.0], [28.3, 1514.0], [28.4, 1514.0], [28.5, 1514.0], [28.6, 1514.0], [28.7, 1514.0], [28.8, 1514.0], [28.9, 1514.0], [29.0, 1514.0], [29.1, 1514.0], [29.2, 1514.0], [29.3, 1514.0], [29.4, 1514.0], [29.5, 1515.0], [29.6, 1515.0], [29.7, 1515.0], [29.8, 1515.0], [29.9, 1515.0], [30.0, 1515.0], [30.1, 1515.0], [30.2, 1515.0], [30.3, 1515.0], [30.4, 1515.0], [30.5, 1515.0], [30.6, 1515.0], [30.7, 1515.0], [30.8, 1515.0], [30.9, 1515.0], [31.0, 1515.0], [31.1, 1515.0], [31.2, 1515.0], [31.3, 1515.0], [31.4, 1515.0], [31.5, 1515.0], [31.6, 1515.0], [31.7, 1515.0], [31.8, 1515.0], [31.9, 1515.0], [32.0, 1515.0], [32.1, 1515.0], [32.2, 1515.0], [32.3, 1515.0], [32.4, 1515.0], [32.5, 1515.0], [32.6, 1515.0], [32.7, 1515.0], [32.8, 1515.0], [32.9, 1515.0], [33.0, 1515.0], [33.1, 1515.0], [33.2, 1515.0], [33.3, 1515.0], [33.4, 1515.0], [33.5, 1515.0], [33.6, 1515.0], [33.7, 1515.0], [33.8, 1515.0], [33.9, 1515.0], [34.0, 1515.0], [34.1, 1515.0], [34.2, 1515.0], [34.3, 1515.0], [34.4, 1515.0], [34.5, 1515.0], [34.6, 1515.0], [34.7, 1515.0], [34.8, 1515.0], [34.9, 1515.0], [35.0, 1515.0], [35.1, 1515.0], [35.2, 1515.0], [35.3, 1515.0], [35.4, 1515.0], [35.5, 1515.0], [35.6, 1516.0], [35.7, 1516.0], [35.8, 1516.0], [35.9, 1516.0], [36.0, 1516.0], [36.1, 1516.0], [36.2, 1516.0], [36.3, 1516.0], [36.4, 1516.0], [36.5, 1516.0], [36.6, 1516.0], [36.7, 1516.0], [36.8, 1516.0], [36.9, 1516.0], [37.0, 1516.0], [37.1, 1516.0], [37.2, 1516.0], [37.3, 1516.0], [37.4, 1516.0], [37.5, 1516.0], [37.6, 1516.0], [37.7, 1516.0], [37.8, 1516.0], [37.9, 1516.0], [38.0, 1516.0], [38.1, 1516.0], [38.2, 1516.0], [38.3, 1516.0], [38.4, 1516.0], [38.5, 1516.0], [38.6, 1516.0], [38.7, 1516.0], [38.8, 1516.0], [38.9, 1516.0], [39.0, 1516.0], [39.1, 1516.0], [39.2, 1516.0], [39.3, 1516.0], [39.4, 1516.0], [39.5, 1516.0], [39.6, 1516.0], [39.7, 1516.0], [39.8, 1516.0], [39.9, 1516.0], [40.0, 1516.0], [40.1, 1516.0], [40.2, 1516.0], [40.3, 1516.0], [40.4, 1516.0], [40.5, 1516.0], [40.6, 1516.0], [40.7, 1516.0], [40.8, 1516.0], [40.9, 1516.0], [41.0, 1516.0], [41.1, 1516.0], [41.2, 1516.0], [41.3, 1516.0], [41.4, 1516.0], [41.5, 1516.0], [41.6, 1516.0], [41.7, 1516.0], [41.8, 1516.0], [41.9, 1516.0], [42.0, 1516.0], [42.1, 1516.0], [42.2, 1516.0], [42.3, 1516.0], [42.4, 1516.0], [42.5, 1516.0], [42.6, 1517.0], [42.7, 1517.0], [42.8, 1517.0], [42.9, 1517.0], [43.0, 1517.0], [43.1, 1517.0], [43.2, 1517.0], [43.3, 1517.0], [43.4, 1517.0], [43.5, 1517.0], [43.6, 1517.0], [43.7, 1517.0], [43.8, 1517.0], [43.9, 1517.0], [44.0, 1517.0], [44.1, 1517.0], [44.2, 1517.0], [44.3, 1517.0], [44.4, 1517.0], [44.5, 1517.0], [44.6, 1517.0], [44.7, 1517.0], [44.8, 1517.0], [44.9, 1517.0], [45.0, 1517.0], [45.1, 1517.0], [45.2, 1517.0], [45.3, 1517.0], [45.4, 1517.0], [45.5, 1517.0], [45.6, 1517.0], [45.7, 1517.0], [45.8, 1517.0], [45.9, 1517.0], [46.0, 1517.0], [46.1, 1517.0], [46.2, 1517.0], [46.3, 1517.0], [46.4, 1517.0], [46.5, 1517.0], [46.6, 1517.0], [46.7, 1517.0], [46.8, 1517.0], [46.9, 1517.0], [47.0, 1517.0], [47.1, 1517.0], [47.2, 1517.0], [47.3, 1517.0], [47.4, 1517.0], [47.5, 1517.0], [47.6, 1517.0], [47.7, 1517.0], [47.8, 1517.0], [47.9, 1517.0], [48.0, 1517.0], [48.1, 1517.0], [48.2, 1517.0], [48.3, 1517.0], [48.4, 1517.0], [48.5, 1517.0], [48.6, 1517.0], [48.7, 1517.0], [48.8, 1517.0], [48.9, 1517.0], [49.0, 1517.0], [49.1, 1517.0], [49.2, 1517.0], [49.3, 1517.0], [49.4, 1517.0], [49.5, 1517.0], [49.6, 1517.0], [49.7, 1517.0], [49.8, 1517.0], [49.9, 1517.0], [50.0, 1517.0], [50.1, 1518.0], [50.2, 1518.0], [50.3, 1518.0], [50.4, 1518.0], [50.5, 1518.0], [50.6, 1518.0], [50.7, 1518.0], [50.8, 1518.0], [50.9, 1518.0], [51.0, 1518.0], [51.1, 1518.0], [51.2, 1518.0], [51.3, 1518.0], [51.4, 1518.0], [51.5, 1518.0], [51.6, 1518.0], [51.7, 1518.0], [51.8, 1518.0], [51.9, 1518.0], [52.0, 1518.0], [52.1, 1518.0], [52.2, 1518.0], [52.3, 1518.0], [52.4, 1518.0], [52.5, 1518.0], [52.6, 1518.0], [52.7, 1518.0], [52.8, 1518.0], [52.9, 1518.0], [53.0, 1518.0], [53.1, 1518.0], [53.2, 1518.0], [53.3, 1518.0], [53.4, 1518.0], [53.5, 1518.0], [53.6, 1518.0], [53.7, 1518.0], [53.8, 1518.0], [53.9, 1518.0], [54.0, 1518.0], [54.1, 1518.0], [54.2, 1518.0], [54.3, 1518.0], [54.4, 1518.0], [54.5, 1518.0], [54.6, 1518.0], [54.7, 1518.0], [54.8, 1518.0], [54.9, 1518.0], [55.0, 1518.0], [55.1, 1518.0], [55.2, 1518.0], [55.3, 1518.0], [55.4, 1518.0], [55.5, 1518.0], [55.6, 1518.0], [55.7, 1518.0], [55.8, 1518.0], [55.9, 1518.0], [56.0, 1518.0], [56.1, 1518.0], [56.2, 1518.0], [56.3, 1518.0], [56.4, 1518.0], [56.5, 1518.0], [56.6, 1518.0], [56.7, 1518.0], [56.8, 1518.0], [56.9, 1518.0], [57.0, 1518.0], [57.1, 1518.0], [57.2, 1518.0], [57.3, 1518.0], [57.4, 1519.0], [57.5, 1519.0], [57.6, 1519.0], [57.7, 1519.0], [57.8, 1519.0], [57.9, 1519.0], [58.0, 1519.0], [58.1, 1519.0], [58.2, 1519.0], [58.3, 1519.0], [58.4, 1519.0], [58.5, 1519.0], [58.6, 1519.0], [58.7, 1519.0], [58.8, 1519.0], [58.9, 1519.0], [59.0, 1519.0], [59.1, 1519.0], [59.2, 1519.0], [59.3, 1519.0], [59.4, 1519.0], [59.5, 1519.0], [59.6, 1519.0], [59.7, 1519.0], [59.8, 1519.0], [59.9, 1519.0], [60.0, 1519.0], [60.1, 1519.0], [60.2, 1519.0], [60.3, 1519.0], [60.4, 1519.0], [60.5, 1519.0], [60.6, 1519.0], [60.7, 1519.0], [60.8, 1519.0], [60.9, 1519.0], [61.0, 1519.0], [61.1, 1519.0], [61.2, 1519.0], [61.3, 1519.0], [61.4, 1519.0], [61.5, 1519.0], [61.6, 1519.0], [61.7, 1519.0], [61.8, 1519.0], [61.9, 1519.0], [62.0, 1519.0], [62.1, 1519.0], [62.2, 1519.0], [62.3, 1519.0], [62.4, 1519.0], [62.5, 1519.0], [62.6, 1519.0], [62.7, 1519.0], [62.8, 1519.0], [62.9, 1519.0], [63.0, 1519.0], [63.1, 1519.0], [63.2, 1519.0], [63.3, 1519.0], [63.4, 1519.0], [63.5, 1519.0], [63.6, 1519.0], [63.7, 1519.0], [63.8, 1519.0], [63.9, 1519.0], [64.0, 1519.0], [64.1, 1519.0], [64.2, 1519.0], [64.3, 1519.0], [64.4, 1520.0], [64.5, 1520.0], [64.6, 1520.0], [64.7, 1520.0], [64.8, 1520.0], [64.9, 1520.0], [65.0, 1520.0], [65.1, 1520.0], [65.2, 1520.0], [65.3, 1520.0], [65.4, 1520.0], [65.5, 1520.0], [65.6, 1520.0], [65.7, 1520.0], [65.8, 1520.0], [65.9, 1520.0], [66.0, 1520.0], [66.1, 1520.0], [66.2, 1520.0], [66.3, 1520.0], [66.4, 1520.0], [66.5, 1520.0], [66.6, 1520.0], [66.7, 1520.0], [66.8, 1520.0], [66.9, 1520.0], [67.0, 1520.0], [67.1, 1520.0], [67.2, 1520.0], [67.3, 1520.0], [67.4, 1520.0], [67.5, 1520.0], [67.6, 1520.0], [67.7, 1520.0], [67.8, 1520.0], [67.9, 1520.0], [68.0, 1520.0], [68.1, 1520.0], [68.2, 1520.0], [68.3, 1520.0], [68.4, 1520.0], [68.5, 1520.0], [68.6, 1520.0], [68.7, 1520.0], [68.8, 1520.0], [68.9, 1520.0], [69.0, 1520.0], [69.1, 1520.0], [69.2, 1520.0], [69.3, 1520.0], [69.4, 1520.0], [69.5, 1520.0], [69.6, 1520.0], [69.7, 1520.0], [69.8, 1520.0], [69.9, 1520.0], [70.0, 1520.0], [70.1, 1520.0], [70.2, 1520.0], [70.3, 1520.0], [70.4, 1520.0], [70.5, 1520.0], [70.6, 1521.0], [70.7, 1521.0], [70.8, 1521.0], [70.9, 1521.0], [71.0, 1521.0], [71.1, 1521.0], [71.2, 1521.0], [71.3, 1521.0], [71.4, 1521.0], [71.5, 1521.0], [71.6, 1521.0], [71.7, 1521.0], [71.8, 1521.0], [71.9, 1521.0], [72.0, 1521.0], [72.1, 1521.0], [72.2, 1521.0], [72.3, 1521.0], [72.4, 1521.0], [72.5, 1521.0], [72.6, 1521.0], [72.7, 1521.0], [72.8, 1521.0], [72.9, 1521.0], [73.0, 1521.0], [73.1, 1521.0], [73.2, 1521.0], [73.3, 1521.0], [73.4, 1521.0], [73.5, 1521.0], [73.6, 1521.0], [73.7, 1521.0], [73.8, 1521.0], [73.9, 1521.0], [74.0, 1521.0], [74.1, 1521.0], [74.2, 1521.0], [74.3, 1521.0], [74.4, 1521.0], [74.5, 1521.0], [74.6, 1521.0], [74.7, 1521.0], [74.8, 1521.0], [74.9, 1521.0], [75.0, 1521.0], [75.1, 1521.0], [75.2, 1521.0], [75.3, 1521.0], [75.4, 1521.0], [75.5, 1521.0], [75.6, 1521.0], [75.7, 1521.0], [75.8, 1521.0], [75.9, 1522.0], [76.0, 1522.0], [76.1, 1522.0], [76.2, 1522.0], [76.3, 1522.0], [76.4, 1522.0], [76.5, 1522.0], [76.6, 1522.0], [76.7, 1522.0], [76.8, 1522.0], [76.9, 1522.0], [77.0, 1522.0], [77.1, 1522.0], [77.2, 1522.0], [77.3, 1522.0], [77.4, 1522.0], [77.5, 1522.0], [77.6, 1522.0], [77.7, 1522.0], [77.8, 1522.0], [77.9, 1522.0], [78.0, 1522.0], [78.1, 1522.0], [78.2, 1522.0], [78.3, 1522.0], [78.4, 1522.0], [78.5, 1522.0], [78.6, 1522.0], [78.7, 1522.0], [78.8, 1522.0], [78.9, 1522.0], [79.0, 1522.0], [79.1, 1522.0], [79.2, 1522.0], [79.3, 1522.0], [79.4, 1522.0], [79.5, 1522.0], [79.6, 1522.0], [79.7, 1522.0], [79.8, 1522.0], [79.9, 1522.0], [80.0, 1522.0], [80.1, 1522.0], [80.2, 1522.0], [80.3, 1522.0], [80.4, 1523.0], [80.5, 1523.0], [80.6, 1523.0], [80.7, 1523.0], [80.8, 1523.0], [80.9, 1523.0], [81.0, 1523.0], [81.1, 1523.0], [81.2, 1523.0], [81.3, 1523.0], [81.4, 1523.0], [81.5, 1523.0], [81.6, 1523.0], [81.7, 1523.0], [81.8, 1523.0], [81.9, 1523.0], [82.0, 1523.0], [82.1, 1523.0], [82.2, 1523.0], [82.3, 1523.0], [82.4, 1523.0], [82.5, 1523.0], [82.6, 1523.0], [82.7, 1523.0], [82.8, 1523.0], [82.9, 1523.0], [83.0, 1523.0], [83.1, 1523.0], [83.2, 1523.0], [83.3, 1523.0], [83.4, 1523.0], [83.5, 1523.0], [83.6, 1523.0], [83.7, 1523.0], [83.8, 1523.0], [83.9, 1523.0], [84.0, 1523.0], [84.1, 1523.0], [84.2, 1524.0], [84.3, 1524.0], [84.4, 1524.0], [84.5, 1524.0], [84.6, 1524.0], [84.7, 1524.0], [84.8, 1524.0], [84.9, 1524.0], [85.0, 1524.0], [85.1, 1524.0], [85.2, 1524.0], [85.3, 1524.0], [85.4, 1524.0], [85.5, 1524.0], [85.6, 1524.0], [85.7, 1524.0], [85.8, 1524.0], [85.9, 1524.0], [86.0, 1524.0], [86.1, 1524.0], [86.2, 1524.0], [86.3, 1524.0], [86.4, 1524.0], [86.5, 1524.0], [86.6, 1524.0], [86.7, 1524.0], [86.8, 1524.0], [86.9, 1525.0], [87.0, 1525.0], [87.1, 1525.0], [87.2, 1525.0], [87.3, 1525.0], [87.4, 1525.0], [87.5, 1525.0], [87.6, 1525.0], [87.7, 1525.0], [87.8, 1525.0], [87.9, 1525.0], [88.0, 1525.0], [88.1, 1525.0], [88.2, 1525.0], [88.3, 1525.0], [88.4, 1525.0], [88.5, 1525.0], [88.6, 1526.0], [88.7, 1526.0], [88.8, 1526.0], [88.9, 1526.0], [89.0, 1526.0], [89.1, 1526.0], [89.2, 1526.0], [89.3, 1526.0], [89.4, 1526.0], [89.5, 1526.0], [89.6, 1526.0], [89.7, 1526.0], [89.8, 1526.0], [89.9, 1526.0], [90.0, 1527.0], [90.1, 1527.0], [90.2, 1527.0], [90.3, 1527.0], [90.4, 1527.0], [90.5, 1527.0], [90.6, 1527.0], [90.7, 1527.0], [90.8, 1527.0], [90.9, 1528.0], [91.0, 1528.0], [91.1, 1528.0], [91.2, 1528.0], [91.3, 1528.0], [91.4, 1528.0], [91.5, 1529.0], [91.6, 1529.0], [91.7, 1529.0], [91.8, 1529.0], [91.9, 1529.0], [92.0, 1529.0], [92.1, 1530.0], [92.2, 1530.0], [92.3, 1530.0], [92.4, 1531.0], [92.5, 1531.0], [92.6, 1531.0], [92.7, 1532.0], [92.8, 1532.0], [92.9, 1533.0], [93.0, 1533.0], [93.1, 1534.0], [93.2, 1535.0], [93.3, 1536.0], [93.4, 1536.0], [93.5, 1537.0], [93.6, 1538.0], [93.7, 1538.0], [93.8, 1539.0], [93.9, 1540.0], [94.0, 1540.0], [94.1, 1541.0], [94.2, 1542.0], [94.3, 1542.0], [94.4, 1543.0], [94.5, 1544.0], [94.6, 1545.0], [94.7, 1546.0], [94.8, 1547.0], [94.9, 1547.0], [95.0, 1549.0], [95.1, 1550.0], [95.2, 1551.0], [95.3, 1551.0], [95.4, 1552.0], [95.5, 1553.0], [95.6, 1554.0], [95.7, 1556.0], [95.8, 1557.0], [95.9, 1558.0], [96.0, 1559.0], [96.1, 1560.0], [96.2, 1561.0], [96.3, 1563.0], [96.4, 1565.0], [96.5, 1566.0], [96.6, 1568.0], [96.7, 1570.0], [96.8, 1571.0], [96.9, 1572.0], [97.0, 1573.0], [97.1, 1573.0], [97.2, 1574.0], [97.3, 1576.0], [97.4, 1577.0], [97.5, 1578.0], [97.6, 1579.0], [97.7, 1580.0], [97.8, 1581.0], [97.9, 1582.0], [98.0, 1583.0], [98.1, 1585.0], [98.2, 1588.0], [98.3, 1589.0], [98.4, 1591.0], [98.5, 1592.0], [98.6, 1593.0], [98.7, 1595.0], [98.8, 1596.0], [98.9, 1597.0], [99.0, 1599.0], [99.1, 1602.0], [99.2, 1604.0], [99.3, 1606.0], [99.4, 1607.0], [99.5, 1610.0], [99.6, 1613.0], [99.7, 1616.0], [99.8, 1621.0], [99.9, 1631.0], [100.0, 1649.0]], "isOverall": false, "label": "process-blocking", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1829.0, "minX": 0.0, "maxY": 179135.0, "series": [{"data": [[0.0, 1829.0], [1500.0, 179135.0], [500.0, 2538.0], [1000.0, 14313.0]], "isOverall": false, "label": "process-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 1500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 37.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 178912.0, "series": [{"data": [[1.0, 17069.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 37.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 1797.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 178912.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 864.8401445649148, "minX": 1.5228234E12, "maxY": 1000.0, "series": [{"data": [[1.5228237E12, 864.8401445649148], [1.52282352E12, 1000.0], [1.52282358E12, 1000.0], [1.5228234E12, 927.4784508990359], [1.52282346E12, 1000.0], [1.52282364E12, 1000.0]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5228237E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 300.0, "minX": 2.0, "maxY": 1530.0, "series": [{"data": [[2.0, 1521.0], [3.0, 1515.0], [4.0, 1511.0], [6.0, 1512.5], [7.0, 1517.0], [10.0, 1511.0], [30.0, 311.0], [31.0, 307.0], [32.0, 305.0], [34.0, 303.0], [36.0, 304.0], [38.0, 306.0], [39.0, 1109.0], [40.0, 304.0], [42.0, 710.6666666666667], [43.0, 1109.3333333333333], [44.0, 1107.0], [45.0, 304.0], [46.0, 304.0], [47.0, 906.0], [48.0, 1107.6666666666667], [49.0, 302.0], [51.0, 907.5], [50.0, 1513.0], [53.0, 705.6666666666667], [52.0, 1509.0], [54.0, 905.5], [55.0, 302.0], [56.0, 1107.3333333333333], [57.0, 302.0], [58.0, 302.0], [59.0, 1268.2], [60.0, 992.2857142857143], [61.0, 905.75], [62.0, 907.25], [63.0, 604.5], [64.0, 906.5], [65.0, 1166.857142857143], [66.0, 303.0], [67.0, 303.0], [68.0, 302.5], [69.0, 707.0], [71.0, 1073.4545454545453], [72.0, 706.6666666666667], [73.0, 301.0], [74.0, 302.0], [75.0, 303.5], [76.0, 303.0], [77.0, 787.2], [78.0, 1028.2], [79.0, 908.0], [80.0, 907.0], [81.0, 304.0], [82.0, 906.5], [83.0, 786.6], [84.0, 1108.3333333333333], [85.0, 705.6666666666667], [86.0, 1307.4166666666665], [87.0, 302.0], [88.0, 305.5], [89.0, 303.5], [90.0, 301.5], [91.0, 305.3333333333333], [92.0, 303.0], [93.0, 301.4], [94.0, 305.0], [95.0, 1081.5714285714287], [96.0, 301.0], [97.0, 302.0], [98.0, 302.3333333333333], [99.0, 302.0], [101.0, 301.0], [102.0, 305.3333333333333], [103.0, 303.4], [104.0, 306.0], [105.0, 303.3333333333333], [106.0, 301.5], [107.0, 303.3333333333333], [108.0, 302.0], [109.0, 301.5], [110.0, 301.6666666666667], [111.0, 301.0], [112.0, 606.0], [113.0, 304.5], [114.0, 1171.5714285714287], [115.0, 606.25], [116.0, 301.25], [117.0, 301.0], [118.0, 301.0], [119.0, 789.3000000000001], [120.0, 708.6666666666667], [121.0, 707.3333333333333], [122.0, 546.2], [123.0, 304.1666666666667], [124.0, 301.0], [125.0, 301.1428571428571], [126.0, 1276.6], [127.0, 545.8], [128.0, 546.4], [129.0, 545.8], [130.0, 302.0], [131.0, 708.25], [132.0, 605.5], [133.0, 476.7142857142857], [134.0, 301.6666666666667], [135.0, 707.6666666666667], [136.0, 572.8888888888889], [138.0, 573.7777777777778], [139.0, 708.6666666666667], [140.0, 453.875], [141.0, 910.5], [142.0, 910.75], [143.0, 789.6], [144.0, 436.77777777777777], [145.0, 545.0], [146.0, 1113.0], [147.0, 306.0], [148.0, 544.6], [149.0, 303.0], [150.0, 708.0], [151.0, 650.1428571428571], [152.0, 302.8], [153.0, 301.14285714285717], [154.0, 607.25], [155.0, 303.44444444444446], [156.0, 301.0], [157.0, 300.0], [158.0, 789.9], [159.0, 707.0], [160.0, 305.0], [161.0, 303.49999999999994], [162.0, 301.4], [163.0, 744.0909090909091], [164.0, 546.0], [165.0, 302.3333333333333], [166.0, 301.4], [167.0, 1215.0], [168.0, 438.0], [169.0, 302.0], [170.0, 303.25], [171.0, 912.75], [172.0, 305.0], [173.0, 303.25], [174.0, 605.6666666666666], [175.0, 758.625], [176.0, 1215.25], [177.0, 302.4], [178.0, 302.2], [179.0, 758.0], [180.0, 302.5714285714286], [181.0, 606.125], [182.0, 300.8333333333333], [183.0, 422.40000000000003], [184.0, 788.6], [185.0, 301.3333333333333], [186.0, 302.90909090909093], [187.0, 1112.0], [188.0, 475.1428571428571], [189.0, 474.2857142857143], [190.0, 786.4], [191.0, 649.2857142857142], [192.0, 403.25], [193.0, 452.875], [194.0, 604.5], [195.0, 301.8], [196.0, 757.25], [197.0, 454.875], [198.0, 440.44444444444446], [199.0, 301.6], [200.0, 605.625], [201.0, 301.8333333333333], [202.0, 608.0], [203.0, 504.83333333333337], [204.0, 300.72727272727275], [205.0, 300.4], [206.0, 301.3333333333333], [207.0, 300.6], [208.0, 301.0], [209.0, 301.83333333333337], [210.0, 885.4], [211.0, 301.0], [212.0, 304.6666666666667], [213.0, 301.7142857142857], [214.0, 303.4], [215.0, 300.7142857142857], [216.0, 302.75], [217.0, 302.0], [218.0, 301.0], [219.0, 303.8571428571429], [220.0, 302.0], [222.0, 307.2608695652174], [223.0, 300.6666666666667], [224.0, 302.25], [225.0, 475.2857142857143], [226.0, 476.57142857142856], [227.0, 425.4], [228.0, 632.3636363636364], [229.0, 605.5], [230.0, 301.1428571428571], [231.0, 604.875], [232.0, 304.6666666666667], [233.0, 609.0], [234.0, 307.25], [235.0, 712.7777777777778], [236.0, 912.5], [237.0, 615.0], [238.0, 310.16666666666663], [239.0, 487.57142857142856], [240.0, 533.9090909090909], [241.0, 713.0], [242.0, 437.7], [243.0, 463.125], [244.0, 767.0], [245.0, 587.6666666666667], [246.0, 400.0], [247.0, 320.3333333333333], [248.0, 563.0], [249.0, 476.5], [250.0, 334.0], [251.0, 515.1428571428571], [252.0, 454.47368421052636], [253.0, 314.8333333333333], [254.0, 558.4], [255.0, 803.2], [257.0, 459.90000000000003], [256.0, 506.0], [258.0, 338.5], [259.0, 334.83333333333337], [260.0, 335.5], [261.0, 537.3333333333333], [262.0, 345.3333333333333], [263.0, 641.5], [264.0, 431.85714285714283], [270.0, 361.77777777777777], [271.0, 826.9], [268.0, 522.8571428571429], [269.0, 363.6666666666667], [265.0, 787.5], [266.0, 351.5], [267.0, 323.6666666666667], [273.0, 357.0], [272.0, 366.22222222222223], [274.0, 549.3333333333334], [275.0, 499.75], [276.0, 809.7391304347825], [277.0, 644.5], [278.0, 592.2], [279.0, 364.57142857142856], [280.0, 942.5], [287.0, 370.6666666666667], [284.0, 369.79999999999995], [286.0, 754.3333333333334], [282.0, 375.5652173913043], [283.0, 827.0999999999999], [289.0, 371.0], [288.0, 360.75], [290.0, 379.7142857142857], [291.0, 382.0], [292.0, 389.5], [293.0, 391.28571428571433], [294.0, 385.38461538461536], [295.0, 1404.3999999999999], [296.0, 387.33333333333337], [302.0, 737.0], [303.0, 394.8888888888889], [300.0, 400.8888888888889], [301.0, 561.5714285714286], [297.0, 394.16666666666663], [298.0, 397.3333333333333], [299.0, 403.5], [305.0, 404.5], [304.0, 403.5], [306.0, 711.3888888888889], [307.0, 393.0], [308.0, 401.85714285714283], [309.0, 397.5714285714286], [310.0, 968.0], [311.0, 1525.0], [312.0, 412.55], [318.0, 415.77777777777777], [319.0, 692.625], [316.0, 418.5], [317.0, 637.0], [313.0, 406.72727272727275], [314.0, 405.25], [315.0, 779.1666666666667], [321.0, 694.75], [320.0, 414.2857142857143], [322.0, 402.0], [323.0, 816.3636363636364], [324.0, 505.1538461538462], [325.0, 790.3333333333333], [326.0, 795.8888888888889], [327.0, 594.5714285714286], [328.0, 707.625], [334.0, 443.2], [335.0, 686.3333333333334], [332.0, 448.85714285714283], [333.0, 548.8], [329.0, 440.16666666666663], [330.0, 435.5], [331.0, 575.0], [337.0, 432.0], [336.0, 644.3125], [338.0, 443.14285714285717], [339.0, 445.42857142857144], [341.0, 457.0], [340.0, 1523.0], [342.0, 504.7619047619048], [343.0, 607.6153846153846], [344.0, 562.4444444444445], [350.0, 450.42857142857144], [351.0, 608.2857142857142], [348.0, 720.25], [349.0, 721.375], [346.0, 609.2857142857142], [347.0, 568.3333333333334], [353.0, 471.42857142857144], [352.0, 814.3333333333333], [354.0, 461.9166666666667], [355.0, 817.3333333333333], [356.0, 467.5], [357.0, 610.1428571428571], [359.0, 625.1428571428571], [358.0, 1523.0], [360.0, 480.75], [366.0, 486.42857142857144], [367.0, 484.0], [364.0, 943.6666666666666], [365.0, 631.0], [361.0, 479.00000000000006], [363.0, 481.375], [362.0, 1523.25], [369.0, 718.6666666666666], [368.0, 484.0], [371.0, 1012.5], [380.0, 492.2857142857143], [381.0, 834.6666666666666], [382.0, 498.5], [383.0, 503.61538461538464], [372.0, 702.4], [373.0, 490.2727272727273], [374.0, 482.0], [375.0, 1523.0], [376.0, 494.3333333333333], [377.0, 486.88235294117646], [379.0, 747.75], [378.0, 1522.0], [385.0, 842.3333333333333], [384.0, 498.6666666666667], [386.0, 503.66666666666663], [387.0, 728.3571428571429], [388.0, 516.0], [389.0, 920.2], [390.0, 627.7777777777778], [391.0, 510.85714285714283], [393.0, 572.5882352941177], [392.0, 1517.0], [398.0, 720.2], [399.0, 526.0], [396.0, 596.8571428571428], [397.0, 846.1666666666666], [394.0, 529.0], [395.0, 605.9166666666666], [412.0, 533.0], [402.0, 633.3333333333334], [401.0, 545.5], [407.0, 1516.0], [400.0, 1514.0], [403.0, 607.6923076923076], [413.0, 537.2307692307693], [414.0, 533.6666666666666], [415.0, 544.5], [404.0, 646.25], [405.0, 1515.0], [406.0, 600.4], [408.0, 630.4000000000001], [409.0, 530.0], [410.0, 751.1111111111111], [411.0, 537.8333333333333], [417.0, 548.8333333333334], [416.0, 537.8333333333334], [418.0, 553.5], [419.0, 553.3333333333334], [420.0, 551.0], [421.0, 551.0], [423.0, 668.1666666666665], [422.0, 1519.5], [424.0, 562.0], [431.0, 579.0], [430.0, 1519.0], [428.0, 560.75], [429.0, 851.0], [425.0, 559.0], [426.0, 676.0666666666667], [427.0, 553.0], [433.0, 620.0434782608696], [432.0, 1285.5], [434.0, 674.6666666666667], [435.0, 1518.0], [444.0, 573.6666666666666], [445.0, 892.6666666666667], [446.0, 583.8333333333333], [447.0, 585.1666666666667], [436.0, 1005.9999999999999], [437.0, 680.1111111111111], [438.0, 570.6666666666666], [439.0, 705.7142857142858], [440.0, 693.25], [441.0, 580.1666666666666], [442.0, 1207.0], [443.0, 758.4375000000001], [451.0, 585.0], [449.0, 725.7142857142857], [448.0, 958.0], [450.0, 590.5000000000001], [453.0, 816.5238095238095], [455.0, 731.2142857142857], [456.0, 603.3076923076924], [463.0, 607.578947368421], [461.0, 603.0], [460.0, 1520.0], [462.0, 791.0], [457.0, 601.0], [458.0, 597.7142857142858], [459.0, 602.8571428571428], [466.0, 1162.2], [464.0, 708.7222222222221], [465.0, 1517.0], [467.0, 614.0], [477.0, 636.1666666666667], [478.0, 629.5], [479.0, 1035.7272727272727], [468.0, 699.2], [469.0, 618.1666666666666], [470.0, 737.75], [471.0, 748.8571428571428], [472.0, 1071.0], [473.0, 871.4999999999999], [474.0, 741.5714285714286], [475.0, 624.375], [481.0, 740.75], [480.0, 730.4444444444445], [483.0, 637.75], [482.0, 1516.0], [492.0, 662.0], [493.0, 657.7142857142857], [494.0, 631.8571428571428], [495.0, 1519.5555555555557], [485.0, 702.4615384615385], [484.0, 1515.0], [486.0, 711.3333333333334], [487.0, 628.6666666666666], [488.0, 633.4285714285714], [489.0, 639.5714285714286], [491.0, 650.0], [498.0, 645.5555555555555], [497.0, 645.7857142857143], [499.0, 656.6666666666667], [508.0, 674.0], [509.0, 671.5], [510.0, 672.0000000000001], [511.0, 674.5714285714286], [501.0, 660.3076923076923], [502.0, 659.5], [503.0, 663.1538461538461], [504.0, 663.3333333333334], [505.0, 663.75], [507.0, 674.8333333333333], [519.0, 673.4285714285714], [515.0, 676.9166666666666], [513.0, 684.6875000000001], [527.0, 799.125], [525.0, 1522.5], [516.0, 671.5384615384615], [517.0, 671.75], [518.0, 673.0], [528.0, 833.7272727272727], [543.0, 724.1875], [540.0, 808.7777777777778], [541.0, 706.5714285714286], [538.0, 711.1666666666666], [539.0, 1201.4666666666665], [536.0, 695.8333333333334], [537.0, 825.2857142857143], [529.0, 671.6666666666666], [531.0, 747.4285714285714], [532.0, 1112.75], [533.0, 864.8], [534.0, 782.4], [535.0, 1113.75], [521.0, 687.0], [522.0, 697.75], [523.0, 693.5714285714287], [524.0, 682.5714285714286], [551.0, 1132.0], [546.0, 776.3571428571429], [545.0, 920.8749999999999], [544.0, 1523.0], [558.0, 719.0], [559.0, 844.5714285714286], [547.0, 983.3333333333333], [548.0, 710.0], [549.0, 960.1000000000001], [550.0, 1520.0], [560.0, 744.75], [573.0, 851.1111111111111], [572.0, 1520.0], [574.0, 1520.0], [575.0, 820.0], [570.0, 845.7777777777778], [571.0, 748.0], [568.0, 856.4285714285713], [569.0, 1061.6], [561.0, 977.2307692307693], [562.0, 891.6], [563.0, 819.3333333333334], [564.0, 715.8888888888889], [565.0, 887.6], [567.0, 859.8571428571428], [566.0, 1520.0], [552.0, 739.5], [553.0, 772.0000000000001], [554.0, 716.0], [556.0, 1521.0], [555.0, 1521.0], [557.0, 822.72], [582.0, 788.0], [577.0, 752.0], [576.0, 813.5], [591.0, 842.1], [589.0, 1140.75], [590.0, 772.75], [578.0, 984.6], [579.0, 990.3], [581.0, 781.0], [583.0, 847.9047619047618], [600.0, 868.875], [601.0, 784.4285714285714], [602.0, 1518.0], [603.0, 852.7333333333333], [604.0, 1040.0], [605.0, 799.0833333333333], [606.0, 1273.0], [607.0, 844.5882352941177], [592.0, 1025.6666666666665], [593.0, 776.9411764705883], [594.0, 1520.0], [595.0, 927.5999999999999], [597.0, 970.875], [596.0, 1520.3333333333333], [598.0, 889.2857142857142], [584.0, 801.8235294117648], [586.0, 1520.0], [585.0, 1520.0], [587.0, 822.9999999999999], [614.0, 807.2857142857143], [609.0, 953.4444444444445], [608.0, 802.25], [623.0, 872.3333333333334], [621.0, 812.5555555555554], [622.0, 948.4], [611.0, 814.0], [610.0, 1481.0], [612.0, 820.75], [613.0, 815.6666666666666], [624.0, 926.090909090909], [639.0, 916.8750000000001], [637.0, 836.5], [638.0, 1050.5], [635.0, 873.6153846153845], [636.0, 995.5], [633.0, 835.8571428571429], [634.0, 1034.0], [625.0, 883.1111111111111], [627.0, 828.0], [628.0, 841.7142857142858], [629.0, 838.6666666666667], [630.0, 1049.0], [631.0, 913.25], [617.0, 805.8636363636364], [618.0, 789.0], [619.0, 806.0], [620.0, 808.5], [647.0, 912.421052631579], [642.0, 980.2], [641.0, 1260.3333333333333], [640.0, 1465.0], [653.0, 849.4705882352943], [655.0, 852.75], [643.0, 892.85], [644.0, 843.3749999999999], [646.0, 858.0], [645.0, 1464.0], [657.0, 865.8333333333334], [671.0, 1173.0], [670.0, 1460.0], [669.0, 1460.0], [667.0, 871.8750000000001], [668.0, 859.8181818181819], [665.0, 962.8571428571429], [664.0, 1459.5], [666.0, 1267.3333333333333], [658.0, 940.2857142857143], [659.0, 864.1666666666667], [660.0, 936.0], [661.0, 998.9999999999999], [663.0, 881.625], [649.0, 1250.235294117647], [648.0, 1465.0], [650.0, 857.5], [651.0, 858.1111111111111], [652.0, 853.25], [679.0, 890.3333333333334], [673.0, 924.6818181818182], [672.0, 898.25], [687.0, 900.1666666666666], [686.0, 1458.0], [684.0, 900.0], [685.0, 896.8333333333334], [674.0, 881.7142857142858], [675.0, 1460.0], [676.0, 1234.8666666666666], [677.0, 888.1764705882351], [688.0, 902.5], [702.0, 940.0], [703.0, 923.3333333333333], [698.0, 916.8181818181818], [701.0, 940.5], [696.0, 917.0], [697.0, 915.75], [689.0, 904.1666666666667], [690.0, 906.5], [691.0, 908.8571428571428], [693.0, 907.6875], [695.0, 1170.9523809523807], [680.0, 899.25], [681.0, 895.8888888888889], [682.0, 900.75], [683.0, 896.9411764705883], [706.0, 934.7857142857142], [704.0, 914.7857142857142], [718.0, 952.2], [719.0, 959.8333333333333], [716.0, 944.8333333333333], [717.0, 952.0], [707.0, 912.6666666666666], [709.0, 927.1666666666667], [710.0, 934.5], [711.0, 940.7777777777778], [720.0, 954.875], [734.0, 955.6666666666666], [735.0, 1524.4], [732.0, 1196.8], [733.0, 986.1212121212122], [728.0, 987.5333333333334], [731.0, 1303.0], [721.0, 947.8571428571429], [723.0, 951.875], [725.0, 952.9230769230769], [727.0, 949.5384615384615], [712.0, 933.5], [713.0, 928.6666666666666], [714.0, 936.0], [715.0, 934.3333333333334], [743.0, 968.5555555555555], [738.0, 1044.0], [736.0, 945.3478260869564], [737.0, 1525.0], [749.0, 1024.8], [751.0, 1109.6666666666667], [740.0, 1018.7692307692307], [739.0, 1522.0], [741.0, 1387.5], [742.0, 1013.2307692307692], [753.0, 1085.0], [754.0, 1521.0], [763.0, 1015.5000000000001], [764.0, 1521.0], [766.0, 1020.2083333333333], [761.0, 1350.0], [762.0, 1142.5], [755.0, 999.3846153846152], [757.0, 1066.1333333333332], [756.0, 1521.0], [758.0, 1021.5999999999999], [759.0, 1520.0], [744.0, 1251.75], [745.0, 1064.857142857143], [746.0, 1063.0], [747.0, 1530.0], [748.0, 1204.5], [774.0, 1265.0], [770.0, 997.4285714285713], [768.0, 1083.2857142857142], [769.0, 1521.0], [782.0, 1284.0], [781.0, 1522.0], [783.0, 1034.4666666666665], [779.0, 1228.0], [780.0, 1068.375], [771.0, 992.1666666666667], [772.0, 1076.142857142857], [773.0, 1001.7777777777778], [775.0, 1142.625], [793.0, 1090.9487179487178], [796.0, 1032.0869565217395], [795.0, 1521.0], [797.0, 1521.7272727272727], [798.0, 1114.0], [799.0, 1515.0], [784.0, 1521.0], [785.0, 1101.4666666666665], [787.0, 1069.3809523809523], [786.0, 1522.3333333333333], [788.0, 1139.8888888888887], [791.0, 1053.2], [790.0, 1521.0], [776.0, 1026.0], [777.0, 1093.5714285714287], [806.0, 1161.0], [801.0, 1049.1999999999998], [800.0, 1101.125], [813.0, 1073.75], [815.0, 1089.6923076923078], [802.0, 1142.6], [803.0, 1089.3999999999999], [804.0, 1082.7777777777778], [807.0, 1119.4285714285713], [824.0, 1520.0], [826.0, 1073.4347826086955], [828.0, 1135.5714285714287], [827.0, 1520.0], [830.0, 1211.5000000000002], [831.0, 1124.8181818181818], [817.0, 1081.4000000000003], [818.0, 1069.4285714285713], [820.0, 1305.5], [822.0, 1103.0], [823.0, 1162.6904761904761], [809.0, 1124.3125000000002], [810.0, 1130.625], [837.0, 1162.5714285714287], [843.0, 1162.125], [834.0, 1169.9], [832.0, 1078.2352941176475], [845.0, 1123.3846153846152], [847.0, 1164.6428571428573], [836.0, 1096.1666666666665], [839.0, 1131.1333333333332], [838.0, 1520.25], [856.0, 1122.3478260869565], [858.0, 1120.0], [859.0, 1127.0], [860.0, 1120.111111111111], [861.0, 1130.0], [862.0, 1118.142857142857], [863.0, 1266.75], [848.0, 1258.6666666666667], [850.0, 1131.5], [849.0, 1521.0], [851.0, 1137.0], [852.0, 1133.0], [853.0, 1128.0], [840.0, 1193.6249999999998], [841.0, 1089.0], [842.0, 1247.0], [869.0, 1224.7777777777778], [875.0, 1136.7777777777778], [866.0, 1132.6666666666667], [864.0, 1222.5000000000002], [865.0, 1518.0], [877.0, 1230.3124999999998], [876.0, 1517.0], [878.0, 1161.5], [867.0, 1186.5714285714287], [870.0, 1188.625], [871.0, 1518.0], [888.0, 1172.0], [889.0, 1172.25], [890.0, 1179.6923076923076], [891.0, 1182.25], [892.0, 1162.8235294117646], [893.0, 1153.0], [894.0, 1364.7857142857142], [895.0, 1520.0], [880.0, 1179.0], [881.0, 1374.2857142857142], [883.0, 1172.0285714285715], [886.0, 1171.375], [885.0, 1516.0], [872.0, 1159.0], [873.0, 1181.8666666666668], [874.0, 1268.0], [903.0, 1185.5714285714284], [897.0, 1177.0], [896.0, 1173.6666666666665], [910.0, 1185.0], [911.0, 1196.6666666666667], [899.0, 1178.2857142857142], [900.0, 1183.2857142857142], [902.0, 1189.111111111111], [912.0, 1206.3333333333333], [927.0, 1218.6666666666665], [924.0, 1214.5], [926.0, 1222.8333333333335], [922.0, 1215.1111111111109], [923.0, 1214.0], [920.0, 1210.7692307692305], [921.0, 1215.3333333333333], [913.0, 1204.1153846153845], [915.0, 1206.3124999999998], [916.0, 1201.5714285714287], [918.0, 1207.8333333333335], [904.0, 1186.25], [905.0, 1198.0], [907.0, 1191.0399999999997], [908.0, 1168.0], [930.0, 1215.2857142857142], [940.0, 1242.5], [929.0, 1219.1428571428573], [943.0, 1221.6666666666665], [941.0, 1254.0], [942.0, 1251.8421052631581], [932.0, 1225.6249999999995], [934.0, 1226.25], [935.0, 1235.2222222222222], [952.0, 1256.235294117647], [953.0, 1238.0], [954.0, 1246.5], [955.0, 1255.6666666666667], [957.0, 1260.8333333333333], [958.0, 1275.857142857143], [959.0, 1270.7692307692307], [944.0, 1222.1], [945.0, 1234.4375000000002], [946.0, 1232.5714285714284], [948.0, 1240.5], [950.0, 1251.857142857143], [951.0, 1262.4], [936.0, 1231.0], [937.0, 1226.2380952380954], [938.0, 1225.0], [962.0, 1270.9375], [960.0, 1270.0], [973.0, 1276.5], [975.0, 1264.1739130434783], [964.0, 1268.5], [965.0, 1269.5555555555554], [966.0, 1282.5], [967.0, 1265.6666666666667], [978.0, 1265.5], [988.0, 1303.928571428571], [989.0, 1302.7142857142856], [986.0, 1322.0], [987.0, 1307.8], [984.0, 1293.1666666666667], [985.0, 1306.0], [979.0, 1281.7142857142858], [981.0, 1291.6999999999998], [982.0, 1291.9473684210525], [968.0, 1262.0], [970.0, 1280.0], [971.0, 1285.3333333333333], [972.0, 1280.473684210526], [992.0, 1313.1249999999998], [994.0, 1328.8000000000002], [995.0, 1323.0], [996.0, 1314.1499999999999], [997.0, 1302.4], [998.0, 1299.0], [999.0, 1317.0], [1000.0, 1517.135931986901]], "isOverall": false, "label": "process-blocking", "isController": false}, {"data": [[984.2892096150431, 1494.0155953795054]], "isOverall": false, "label": "process-blocking-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 9112.4, "minX": 1.5228234E12, "maxY": 107335.03333333334, "series": [{"data": [[1.5228237E12, 9651.95], [1.52282352E12, 106190.23333333334], [1.52282358E12, 106039.96666666666], [1.5228234E12, 97002.5], [1.52282346E12, 106061.43333333333], [1.52282364E12, 107335.03333333334]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5228237E12, 9112.4], [1.52282352E12, 100254.13333333333], [1.52282358E12, 100112.26666666666], [1.5228234E12, 91580.0], [1.52282346E12, 100132.53333333334], [1.52282364E12, 99846.26666666666]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5228237E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 1387.991396957124, "minX": 1.5228234E12, "maxY": 1519.0872949680288, "series": [{"data": [[1.5228237E12, 1519.0872949680288], [1.52282352E12, 1517.1771112346678], [1.52282358E12, 1518.4675084771513], [1.5228234E12, 1387.991396957124], [1.52282346E12, 1517.5444517532756], [1.52282364E12, 1517.5822813688153]], "isOverall": false, "label": "process-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5228237E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 1387.9884647302822, "minX": 1.5228234E12, "maxY": 1519.0847928829564, "series": [{"data": [[1.5228237E12, 1519.0847928829564], [1.52282352E12, 1517.175039167135], [1.52282358E12, 1518.4648767650267], [1.5228234E12, 1387.9884647302822], [1.52282346E12, 1517.5423771694575], [1.52282364E12, 1517.569024081108]], "isOverall": false, "label": "process-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5228237E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 0.6961825726141085, "minX": 1.5228234E12, "maxY": 2.376424798443147, "series": [{"data": [[1.5228237E12, 2.376424798443147], [1.52282352E12, 1.409612371759247], [1.52282358E12, 1.757502910066301], [1.5228234E12, 0.6961825726141085], [1.52282346E12, 1.330111825127761], [1.52282364E12, 1.8715842839036885]], "isOverall": false, "label": "process-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5228237E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 300.0, "minX": 1.5228234E12, "maxY": 1649.0, "series": [{"data": [[1.5228237E12, 1612.0], [1.52282352E12, 1645.0], [1.52282358E12, 1628.0], [1.5228234E12, 1634.0], [1.52282346E12, 1649.0], [1.52282364E12, 1636.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5228237E12, 1429.0], [1.52282352E12, 306.0], [1.52282358E12, 305.0], [1.5228234E12, 300.0], [1.52282346E12, 301.0], [1.52282364E12, 302.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5228237E12, 1531.0], [1.52282352E12, 1527.0], [1.52282358E12, 1529.0], [1.5228234E12, 1524.0], [1.52282346E12, 1527.0], [1.52282364E12, 1531.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5228237E12, 1606.0], [1.52282352E12, 1612.0], [1.52282358E12, 1607.0], [1.5228234E12, 1592.0], [1.52282346E12, 1604.0], [1.52282364E12, 1610.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5228237E12, 1552.0], [1.52282352E12, 1558.0], [1.52282358E12, 1559.0], [1.5228234E12, 1535.0], [1.52282346E12, 1552.0], [1.52282364E12, 1555.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5228237E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 12.0, "minX": 59.0, "maxY": 1520.0, "series": [{"data": [[602.0, 1517.0], [658.0, 1519.0], [659.0, 1518.0], [657.0, 1519.0], [59.0, 1520.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[657.0, 12.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 659.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 0.0, "minX": 59.0, "maxY": 1520.0, "series": [{"data": [[602.0, 1517.0], [658.0, 1519.0], [659.0, 1518.0], [657.0, 1519.0], [59.0, 1520.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[657.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 659.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency (ms)",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 43.28333333333333, "minX": 1.5228234E12, "maxY": 659.5666666666667, "series": [{"data": [[1.5228237E12, 43.28333333333333], [1.52282352E12, 659.5666666666667], [1.52282358E12, 658.6333333333333], [1.5228234E12, 619.1666666666666], [1.52282346E12, 658.7666666666667], [1.52282364E12, 657.5]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5228237E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.6166666666666667, "minX": 1.5228234E12, "maxY": 659.5666666666667, "series": [{"data": [[1.5228237E12, 59.95], [1.52282352E12, 659.5666666666667], [1.52282358E12, 658.6333333333333], [1.5228234E12, 602.5], [1.52282346E12, 658.7666666666667], [1.52282364E12, 656.8833333333333]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52282364E12, 0.6166666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5228237E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses/sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.6166666666666667, "minX": 1.5228234E12, "maxY": 659.5666666666667, "series": [{"data": [[1.52282364E12, 0.6166666666666667]], "isOverall": false, "label": "process-blocking-failure", "isController": false}, {"data": [[1.5228237E12, 59.95], [1.52282352E12, 659.5666666666667], [1.52282358E12, 658.6333333333333], [1.5228234E12, 602.5], [1.52282346E12, 658.7666666666667], [1.52282364E12, 656.8833333333333]], "isOverall": false, "label": "process-blocking-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5228237E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
