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
        data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 26875.0, "series": [{"data": [[0.0, 2.0], [0.1, 26.0], [0.2, 30.0], [0.3, 37.0], [0.4, 40.0], [0.5, 45.0], [0.6, 48.0], [0.7, 53.0], [0.8, 58.0], [0.9, 65.0], [1.0, 74.0], [1.1, 300.0], [1.2, 300.0], [1.3, 300.0], [1.4, 300.0], [1.5, 300.0], [1.6, 300.0], [1.7, 300.0], [1.8, 300.0], [1.9, 300.0], [2.0, 300.0], [2.1, 300.0], [2.2, 300.0], [2.3, 300.0], [2.4, 300.0], [2.5, 300.0], [2.6, 300.0], [2.7, 300.0], [2.8, 300.0], [2.9, 300.0], [3.0, 300.0], [3.1, 300.0], [3.2, 300.0], [3.3, 300.0], [3.4, 300.0], [3.5, 300.0], [3.6, 300.0], [3.7, 300.0], [3.8, 300.0], [3.9, 300.0], [4.0, 300.0], [4.1, 300.0], [4.2, 301.0], [4.3, 301.0], [4.4, 301.0], [4.5, 301.0], [4.6, 301.0], [4.7, 301.0], [4.8, 301.0], [4.9, 301.0], [5.0, 301.0], [5.1, 301.0], [5.2, 301.0], [5.3, 301.0], [5.4, 301.0], [5.5, 301.0], [5.6, 301.0], [5.7, 301.0], [5.8, 301.0], [5.9, 301.0], [6.0, 301.0], [6.1, 301.0], [6.2, 301.0], [6.3, 301.0], [6.4, 301.0], [6.5, 301.0], [6.6, 301.0], [6.7, 301.0], [6.8, 301.0], [6.9, 301.0], [7.0, 301.0], [7.1, 301.0], [7.2, 301.0], [7.3, 301.0], [7.4, 301.0], [7.5, 301.0], [7.6, 301.0], [7.7, 301.0], [7.8, 301.0], [7.9, 301.0], [8.0, 301.0], [8.1, 301.0], [8.2, 301.0], [8.3, 301.0], [8.4, 301.0], [8.5, 301.0], [8.6, 301.0], [8.7, 301.0], [8.8, 301.0], [8.9, 301.0], [9.0, 301.0], [9.1, 301.0], [9.2, 301.0], [9.3, 301.0], [9.4, 301.0], [9.5, 301.0], [9.6, 301.0], [9.7, 301.0], [9.8, 301.0], [9.9, 301.0], [10.0, 301.0], [10.1, 301.0], [10.2, 301.0], [10.3, 301.0], [10.4, 301.0], [10.5, 301.0], [10.6, 301.0], [10.7, 301.0], [10.8, 301.0], [10.9, 301.0], [11.0, 301.0], [11.1, 301.0], [11.2, 301.0], [11.3, 301.0], [11.4, 301.0], [11.5, 301.0], [11.6, 301.0], [11.7, 301.0], [11.8, 301.0], [11.9, 301.0], [12.0, 301.0], [12.1, 301.0], [12.2, 301.0], [12.3, 301.0], [12.4, 301.0], [12.5, 301.0], [12.6, 301.0], [12.7, 301.0], [12.8, 301.0], [12.9, 301.0], [13.0, 301.0], [13.1, 301.0], [13.2, 301.0], [13.3, 301.0], [13.4, 301.0], [13.5, 301.0], [13.6, 301.0], [13.7, 301.0], [13.8, 301.0], [13.9, 301.0], [14.0, 301.0], [14.1, 301.0], [14.2, 301.0], [14.3, 301.0], [14.4, 301.0], [14.5, 301.0], [14.6, 301.0], [14.7, 301.0], [14.8, 301.0], [14.9, 301.0], [15.0, 301.0], [15.1, 301.0], [15.2, 302.0], [15.3, 302.0], [15.4, 302.0], [15.5, 302.0], [15.6, 302.0], [15.7, 302.0], [15.8, 302.0], [15.9, 302.0], [16.0, 302.0], [16.1, 302.0], [16.2, 302.0], [16.3, 302.0], [16.4, 302.0], [16.5, 302.0], [16.6, 302.0], [16.7, 302.0], [16.8, 302.0], [16.9, 302.0], [17.0, 302.0], [17.1, 302.0], [17.2, 302.0], [17.3, 302.0], [17.4, 302.0], [17.5, 302.0], [17.6, 302.0], [17.7, 302.0], [17.8, 302.0], [17.9, 302.0], [18.0, 302.0], [18.1, 302.0], [18.2, 302.0], [18.3, 302.0], [18.4, 302.0], [18.5, 302.0], [18.6, 302.0], [18.7, 302.0], [18.8, 302.0], [18.9, 302.0], [19.0, 302.0], [19.1, 302.0], [19.2, 302.0], [19.3, 302.0], [19.4, 302.0], [19.5, 302.0], [19.6, 302.0], [19.7, 302.0], [19.8, 302.0], [19.9, 302.0], [20.0, 302.0], [20.1, 302.0], [20.2, 302.0], [20.3, 302.0], [20.4, 302.0], [20.5, 302.0], [20.6, 302.0], [20.7, 302.0], [20.8, 302.0], [20.9, 302.0], [21.0, 302.0], [21.1, 302.0], [21.2, 302.0], [21.3, 302.0], [21.4, 302.0], [21.5, 302.0], [21.6, 302.0], [21.7, 302.0], [21.8, 302.0], [21.9, 302.0], [22.0, 302.0], [22.1, 302.0], [22.2, 302.0], [22.3, 302.0], [22.4, 302.0], [22.5, 302.0], [22.6, 302.0], [22.7, 302.0], [22.8, 302.0], [22.9, 302.0], [23.0, 302.0], [23.1, 302.0], [23.2, 302.0], [23.3, 302.0], [23.4, 302.0], [23.5, 302.0], [23.6, 302.0], [23.7, 302.0], [23.8, 302.0], [23.9, 302.0], [24.0, 302.0], [24.1, 303.0], [24.2, 303.0], [24.3, 303.0], [24.4, 303.0], [24.5, 303.0], [24.6, 303.0], [24.7, 303.0], [24.8, 303.0], [24.9, 303.0], [25.0, 303.0], [25.1, 303.0], [25.2, 303.0], [25.3, 303.0], [25.4, 303.0], [25.5, 303.0], [25.6, 303.0], [25.7, 303.0], [25.8, 303.0], [25.9, 303.0], [26.0, 303.0], [26.1, 303.0], [26.2, 303.0], [26.3, 303.0], [26.4, 303.0], [26.5, 303.0], [26.6, 303.0], [26.7, 303.0], [26.8, 303.0], [26.9, 303.0], [27.0, 303.0], [27.1, 303.0], [27.2, 303.0], [27.3, 303.0], [27.4, 303.0], [27.5, 303.0], [27.6, 303.0], [27.7, 303.0], [27.8, 303.0], [27.9, 303.0], [28.0, 303.0], [28.1, 303.0], [28.2, 303.0], [28.3, 303.0], [28.4, 303.0], [28.5, 303.0], [28.6, 303.0], [28.7, 303.0], [28.8, 303.0], [28.9, 303.0], [29.0, 303.0], [29.1, 303.0], [29.2, 303.0], [29.3, 303.0], [29.4, 303.0], [29.5, 303.0], [29.6, 303.0], [29.7, 303.0], [29.8, 303.0], [29.9, 303.0], [30.0, 303.0], [30.1, 303.0], [30.2, 303.0], [30.3, 303.0], [30.4, 303.0], [30.5, 303.0], [30.6, 303.0], [30.7, 303.0], [30.8, 303.0], [30.9, 303.0], [31.0, 303.0], [31.1, 303.0], [31.2, 303.0], [31.3, 303.0], [31.4, 303.0], [31.5, 303.0], [31.6, 303.0], [31.7, 304.0], [31.8, 304.0], [31.9, 304.0], [32.0, 304.0], [32.1, 304.0], [32.2, 304.0], [32.3, 304.0], [32.4, 304.0], [32.5, 304.0], [32.6, 304.0], [32.7, 304.0], [32.8, 304.0], [32.9, 304.0], [33.0, 304.0], [33.1, 304.0], [33.2, 304.0], [33.3, 304.0], [33.4, 304.0], [33.5, 304.0], [33.6, 304.0], [33.7, 304.0], [33.8, 304.0], [33.9, 304.0], [34.0, 304.0], [34.1, 304.0], [34.2, 304.0], [34.3, 304.0], [34.4, 304.0], [34.5, 304.0], [34.6, 304.0], [34.7, 304.0], [34.8, 304.0], [34.9, 304.0], [35.0, 304.0], [35.1, 304.0], [35.2, 304.0], [35.3, 304.0], [35.4, 304.0], [35.5, 304.0], [35.6, 304.0], [35.7, 304.0], [35.8, 304.0], [35.9, 304.0], [36.0, 304.0], [36.1, 304.0], [36.2, 304.0], [36.3, 304.0], [36.4, 304.0], [36.5, 304.0], [36.6, 304.0], [36.7, 304.0], [36.8, 304.0], [36.9, 304.0], [37.0, 304.0], [37.1, 304.0], [37.2, 304.0], [37.3, 304.0], [37.4, 304.0], [37.5, 304.0], [37.6, 304.0], [37.7, 304.0], [37.8, 304.0], [37.9, 304.0], [38.0, 304.0], [38.1, 304.0], [38.2, 305.0], [38.3, 305.0], [38.4, 305.0], [38.5, 305.0], [38.6, 305.0], [38.7, 305.0], [38.8, 305.0], [38.9, 305.0], [39.0, 305.0], [39.1, 305.0], [39.2, 305.0], [39.3, 305.0], [39.4, 305.0], [39.5, 305.0], [39.6, 305.0], [39.7, 305.0], [39.8, 305.0], [39.9, 305.0], [40.0, 305.0], [40.1, 305.0], [40.2, 305.0], [40.3, 305.0], [40.4, 305.0], [40.5, 305.0], [40.6, 305.0], [40.7, 305.0], [40.8, 305.0], [40.9, 305.0], [41.0, 305.0], [41.1, 305.0], [41.2, 305.0], [41.3, 305.0], [41.4, 305.0], [41.5, 305.0], [41.6, 305.0], [41.7, 305.0], [41.8, 305.0], [41.9, 305.0], [42.0, 305.0], [42.1, 305.0], [42.2, 305.0], [42.3, 305.0], [42.4, 305.0], [42.5, 305.0], [42.6, 305.0], [42.7, 305.0], [42.8, 305.0], [42.9, 305.0], [43.0, 305.0], [43.1, 305.0], [43.2, 305.0], [43.3, 305.0], [43.4, 305.0], [43.5, 305.0], [43.6, 305.0], [43.7, 305.0], [43.8, 305.0], [43.9, 306.0], [44.0, 306.0], [44.1, 306.0], [44.2, 306.0], [44.3, 306.0], [44.4, 306.0], [44.5, 306.0], [44.6, 306.0], [44.7, 306.0], [44.8, 306.0], [44.9, 306.0], [45.0, 306.0], [45.1, 306.0], [45.2, 306.0], [45.3, 306.0], [45.4, 306.0], [45.5, 306.0], [45.6, 306.0], [45.7, 306.0], [45.8, 306.0], [45.9, 306.0], [46.0, 306.0], [46.1, 306.0], [46.2, 306.0], [46.3, 306.0], [46.4, 306.0], [46.5, 306.0], [46.6, 306.0], [46.7, 306.0], [46.8, 306.0], [46.9, 306.0], [47.0, 306.0], [47.1, 306.0], [47.2, 306.0], [47.3, 306.0], [47.4, 306.0], [47.5, 306.0], [47.6, 306.0], [47.7, 306.0], [47.8, 306.0], [47.9, 306.0], [48.0, 306.0], [48.1, 306.0], [48.2, 306.0], [48.3, 306.0], [48.4, 306.0], [48.5, 306.0], [48.6, 306.0], [48.7, 306.0], [48.8, 307.0], [48.9, 307.0], [49.0, 307.0], [49.1, 307.0], [49.2, 307.0], [49.3, 307.0], [49.4, 307.0], [49.5, 307.0], [49.6, 307.0], [49.7, 307.0], [49.8, 307.0], [49.9, 307.0], [50.0, 307.0], [50.1, 307.0], [50.2, 307.0], [50.3, 307.0], [50.4, 307.0], [50.5, 307.0], [50.6, 307.0], [50.7, 307.0], [50.8, 307.0], [50.9, 307.0], [51.0, 307.0], [51.1, 307.0], [51.2, 307.0], [51.3, 307.0], [51.4, 307.0], [51.5, 307.0], [51.6, 307.0], [51.7, 307.0], [51.8, 307.0], [51.9, 307.0], [52.0, 307.0], [52.1, 307.0], [52.2, 307.0], [52.3, 307.0], [52.4, 307.0], [52.5, 307.0], [52.6, 307.0], [52.7, 307.0], [52.8, 307.0], [52.9, 307.0], [53.0, 307.0], [53.1, 308.0], [53.2, 308.0], [53.3, 308.0], [53.4, 308.0], [53.5, 308.0], [53.6, 308.0], [53.7, 308.0], [53.8, 308.0], [53.9, 308.0], [54.0, 308.0], [54.1, 308.0], [54.2, 308.0], [54.3, 308.0], [54.4, 308.0], [54.5, 308.0], [54.6, 308.0], [54.7, 308.0], [54.8, 308.0], [54.9, 308.0], [55.0, 308.0], [55.1, 308.0], [55.2, 308.0], [55.3, 308.0], [55.4, 308.0], [55.5, 308.0], [55.6, 308.0], [55.7, 308.0], [55.8, 308.0], [55.9, 308.0], [56.0, 308.0], [56.1, 308.0], [56.2, 308.0], [56.3, 308.0], [56.4, 308.0], [56.5, 308.0], [56.6, 308.0], [56.7, 308.0], [56.8, 308.0], [56.9, 309.0], [57.0, 309.0], [57.1, 309.0], [57.2, 309.0], [57.3, 309.0], [57.4, 309.0], [57.5, 309.0], [57.6, 309.0], [57.7, 309.0], [57.8, 309.0], [57.9, 309.0], [58.0, 309.0], [58.1, 309.0], [58.2, 309.0], [58.3, 309.0], [58.4, 309.0], [58.5, 309.0], [58.6, 309.0], [58.7, 309.0], [58.8, 309.0], [58.9, 309.0], [59.0, 309.0], [59.1, 309.0], [59.2, 309.0], [59.3, 309.0], [59.4, 309.0], [59.5, 309.0], [59.6, 309.0], [59.7, 309.0], [59.8, 309.0], [59.9, 309.0], [60.0, 309.0], [60.1, 309.0], [60.2, 310.0], [60.3, 310.0], [60.4, 310.0], [60.5, 310.0], [60.6, 310.0], [60.7, 310.0], [60.8, 310.0], [60.9, 310.0], [61.0, 310.0], [61.1, 310.0], [61.2, 310.0], [61.3, 310.0], [61.4, 310.0], [61.5, 310.0], [61.6, 310.0], [61.7, 310.0], [61.8, 310.0], [61.9, 310.0], [62.0, 310.0], [62.1, 310.0], [62.2, 310.0], [62.3, 310.0], [62.4, 310.0], [62.5, 310.0], [62.6, 310.0], [62.7, 310.0], [62.8, 311.0], [62.9, 311.0], [63.0, 311.0], [63.1, 311.0], [63.2, 311.0], [63.3, 311.0], [63.4, 311.0], [63.5, 311.0], [63.6, 311.0], [63.7, 311.0], [63.8, 311.0], [63.9, 311.0], [64.0, 311.0], [64.1, 311.0], [64.2, 311.0], [64.3, 311.0], [64.4, 311.0], [64.5, 311.0], [64.6, 311.0], [64.7, 311.0], [64.8, 311.0], [64.9, 311.0], [65.0, 312.0], [65.1, 312.0], [65.2, 312.0], [65.3, 312.0], [65.4, 312.0], [65.5, 312.0], [65.6, 312.0], [65.7, 312.0], [65.8, 312.0], [65.9, 312.0], [66.0, 312.0], [66.1, 312.0], [66.2, 312.0], [66.3, 312.0], [66.4, 312.0], [66.5, 312.0], [66.6, 312.0], [66.7, 312.0], [66.8, 312.0], [66.9, 312.0], [67.0, 312.0], [67.1, 313.0], [67.2, 313.0], [67.3, 313.0], [67.4, 313.0], [67.5, 313.0], [67.6, 313.0], [67.7, 313.0], [67.8, 313.0], [67.9, 313.0], [68.0, 313.0], [68.1, 313.0], [68.2, 313.0], [68.3, 313.0], [68.4, 313.0], [68.5, 313.0], [68.6, 313.0], [68.7, 313.0], [68.8, 314.0], [68.9, 314.0], [69.0, 314.0], [69.1, 314.0], [69.2, 314.0], [69.3, 314.0], [69.4, 314.0], [69.5, 314.0], [69.6, 314.0], [69.7, 314.0], [69.8, 314.0], [69.9, 314.0], [70.0, 314.0], [70.1, 314.0], [70.2, 315.0], [70.3, 315.0], [70.4, 315.0], [70.5, 315.0], [70.6, 315.0], [70.7, 315.0], [70.8, 315.0], [70.9, 315.0], [71.0, 315.0], [71.1, 315.0], [71.2, 315.0], [71.3, 315.0], [71.4, 315.0], [71.5, 315.0], [71.6, 316.0], [71.7, 316.0], [71.8, 316.0], [71.9, 316.0], [72.0, 316.0], [72.1, 316.0], [72.2, 316.0], [72.3, 316.0], [72.4, 316.0], [72.5, 316.0], [72.6, 316.0], [72.7, 316.0], [72.8, 316.0], [72.9, 317.0], [73.0, 317.0], [73.1, 317.0], [73.2, 317.0], [73.3, 317.0], [73.4, 317.0], [73.5, 317.0], [73.6, 317.0], [73.7, 317.0], [73.8, 317.0], [73.9, 317.0], [74.0, 317.0], [74.1, 318.0], [74.2, 318.0], [74.3, 318.0], [74.4, 318.0], [74.5, 318.0], [74.6, 318.0], [74.7, 318.0], [74.8, 318.0], [74.9, 318.0], [75.0, 318.0], [75.1, 318.0], [75.2, 318.0], [75.3, 319.0], [75.4, 319.0], [75.5, 319.0], [75.6, 319.0], [75.7, 319.0], [75.8, 319.0], [75.9, 319.0], [76.0, 319.0], [76.1, 319.0], [76.2, 320.0], [76.3, 320.0], [76.4, 320.0], [76.5, 320.0], [76.6, 320.0], [76.7, 320.0], [76.8, 320.0], [76.9, 320.0], [77.0, 320.0], [77.1, 321.0], [77.2, 321.0], [77.3, 321.0], [77.4, 321.0], [77.5, 321.0], [77.6, 321.0], [77.7, 321.0], [77.8, 321.0], [77.9, 321.0], [78.0, 322.0], [78.1, 322.0], [78.2, 322.0], [78.3, 322.0], [78.4, 322.0], [78.5, 322.0], [78.6, 322.0], [78.7, 322.0], [78.8, 323.0], [78.9, 323.0], [79.0, 323.0], [79.1, 323.0], [79.2, 323.0], [79.3, 323.0], [79.4, 323.0], [79.5, 323.0], [79.6, 323.0], [79.7, 324.0], [79.8, 324.0], [79.9, 324.0], [80.0, 324.0], [80.1, 324.0], [80.2, 324.0], [80.3, 324.0], [80.4, 324.0], [80.5, 325.0], [80.6, 325.0], [80.7, 325.0], [80.8, 325.0], [80.9, 325.0], [81.0, 325.0], [81.1, 325.0], [81.2, 325.0], [81.3, 325.0], [81.4, 326.0], [81.5, 326.0], [81.6, 326.0], [81.7, 326.0], [81.8, 326.0], [81.9, 326.0], [82.0, 326.0], [82.1, 326.0], [82.2, 327.0], [82.3, 327.0], [82.4, 327.0], [82.5, 327.0], [82.6, 327.0], [82.7, 327.0], [82.8, 327.0], [82.9, 328.0], [83.0, 328.0], [83.1, 328.0], [83.2, 328.0], [83.3, 328.0], [83.4, 328.0], [83.5, 328.0], [83.6, 329.0], [83.7, 329.0], [83.8, 329.0], [83.9, 329.0], [84.0, 329.0], [84.1, 330.0], [84.2, 330.0], [84.3, 330.0], [84.4, 330.0], [84.5, 330.0], [84.6, 331.0], [84.7, 331.0], [84.8, 331.0], [84.9, 331.0], [85.0, 332.0], [85.1, 332.0], [85.2, 332.0], [85.3, 332.0], [85.4, 333.0], [85.5, 333.0], [85.6, 333.0], [85.7, 334.0], [85.8, 334.0], [85.9, 334.0], [86.0, 335.0], [86.1, 335.0], [86.2, 336.0], [86.3, 336.0], [86.4, 337.0], [86.5, 337.0], [86.6, 338.0], [86.7, 339.0], [86.8, 339.0], [86.9, 340.0], [87.0, 340.0], [87.1, 341.0], [87.2, 342.0], [87.3, 343.0], [87.4, 344.0], [87.5, 344.0], [87.6, 345.0], [87.7, 347.0], [87.8, 348.0], [87.9, 349.0], [88.0, 350.0], [88.1, 352.0], [88.2, 353.0], [88.3, 355.0], [88.4, 357.0], [88.5, 358.0], [88.6, 360.0], [88.7, 362.0], [88.8, 364.0], [88.9, 366.0], [89.0, 368.0], [89.1, 370.0], [89.2, 372.0], [89.3, 374.0], [89.4, 377.0], [89.5, 379.0], [89.6, 382.0], [89.7, 385.0], [89.8, 388.0], [89.9, 391.0], [90.0, 393.0], [90.1, 395.0], [90.2, 397.0], [90.3, 398.0], [90.4, 399.0], [90.5, 400.0], [90.6, 402.0], [90.7, 403.0], [90.8, 405.0], [90.9, 407.0], [91.0, 408.0], [91.1, 409.0], [91.2, 410.0], [91.3, 412.0], [91.4, 413.0], [91.5, 414.0], [91.6, 415.0], [91.7, 416.0], [91.8, 417.0], [91.9, 418.0], [92.0, 420.0], [92.1, 421.0], [92.2, 423.0], [92.3, 424.0], [92.4, 425.0], [92.5, 426.0], [92.6, 427.0], [92.7, 428.0], [92.8, 429.0], [92.9, 431.0], [93.0, 432.0], [93.1, 434.0], [93.2, 435.0], [93.3, 436.0], [93.4, 436.0], [93.5, 437.0], [93.6, 438.0], [93.7, 439.0], [93.8, 440.0], [93.9, 440.0], [94.0, 441.0], [94.1, 442.0], [94.2, 444.0], [94.3, 444.0], [94.4, 446.0], [94.5, 447.0], [94.6, 448.0], [94.7, 449.0], [94.8, 450.0], [94.9, 451.0], [95.0, 452.0], [95.1, 453.0], [95.2, 454.0], [95.3, 455.0], [95.4, 456.0], [95.5, 457.0], [95.6, 457.0], [95.7, 458.0], [95.8, 460.0], [95.9, 461.0], [96.0, 462.0], [96.1, 463.0], [96.2, 464.0], [96.3, 465.0], [96.4, 466.0], [96.5, 467.0], [96.6, 468.0], [96.7, 469.0], [96.8, 471.0], [96.9, 472.0], [97.0, 473.0], [97.1, 475.0], [97.2, 476.0], [97.3, 477.0], [97.4, 479.0], [97.5, 480.0], [97.6, 481.0], [97.7, 483.0], [97.8, 485.0], [97.9, 487.0], [98.0, 489.0], [98.1, 491.0], [98.2, 494.0], [98.3, 497.0], [98.4, 500.0], [98.5, 503.0], [98.6, 506.0], [98.7, 508.0], [98.8, 513.0], [98.9, 519.0], [99.0, 526.0], [99.1, 538.0], [99.2, 566.0], [99.3, 616.0], [99.4, 748.0], [99.5, 1323.0], [99.6, 1367.0], [99.7, 1385.0], [99.8, 2404.0], [99.9, 4267.0]], "isOverall": false, "label": "process-non-blocking", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 3.0, "minX": 0.0, "maxY": 864251.0, "series": [{"data": [[0.0, 864251.0], [2500.0, 20.0], [3500.0, 3.0], [14500.0, 6.0], [4000.0, 1028.0], [1000.0, 2435.0], [21500.0, 28.0], [21000.0, 22.0], [1500.0, 4.0], [26500.0, 58.0], [26000.0, 4.0], [7500.0, 248.0], [500.0, 9901.0], [2000.0, 548.0]], "isOverall": false, "label": "process-non-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 500, "maxX": 26500.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 12.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 854687.0, "series": [{"data": [[1.0, 8448.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 15409.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 854687.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 12.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 1.0, "minX": 1.52282802E12, "maxY": 1000.0, "series": [{"data": [[1.52282814E12, 1000.0], [1.52282808E12, 1000.0], [1.52282826E12, 1000.0], [1.5228282E12, 1000.0], [1.52282838E12, 1.0], [1.52282832E12, 996.226544425012], [1.52282802E12, 857.3182828993661]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52282838E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 300.0, "minX": 1.0, "maxY": 26612.0, "series": [{"data": [[2.0, 26258.0], [4.0, 26375.5], [5.0, 26612.0], [10.0, 302.0], [12.0, 302.0], [14.0, 302.0], [15.0, 302.0], [16.0, 302.0], [17.0, 302.0], [18.0, 302.0], [19.0, 302.0], [20.0, 302.0], [21.0, 301.0], [22.0, 301.0], [45.0, 369.0], [46.0, 385.18181818181824], [47.0, 304.0], [48.0, 304.0], [49.0, 305.0], [50.0, 305.0], [51.0, 304.0], [52.0, 306.0], [53.0, 303.0], [54.0, 305.0], [55.0, 303.6666666666667], [56.0, 303.75], [57.0, 304.0], [58.0, 304.1428571428571], [59.0, 305.5], [61.0, 304.5], [62.0, 304.0], [63.0, 304.0], [64.0, 303.6666666666667], [65.0, 303.75], [67.0, 303.5], [66.0, 304.0], [68.0, 304.0], [69.0, 304.0], [70.0, 305.0], [71.0, 304.0], [72.0, 303.3333333333333], [73.0, 305.5], [74.0, 303.5], [75.0, 304.25], [76.0, 303.62499999999994], [77.0, 304.16666666666663], [78.0, 303.0], [79.0, 302.5], [80.0, 303.4], [82.0, 303.6666666666667], [83.0, 303.0], [81.0, 304.0], [84.0, 303.4], [85.0, 304.5], [86.0, 304.0], [87.0, 303.5], [88.0, 303.5], [89.0, 303.0], [90.0, 302.8], [91.0, 303.5], [92.0, 302.0], [93.0, 303.25], [94.0, 303.75], [95.0, 302.5], [96.0, 303.0], [97.0, 303.0], [98.0, 302.6666666666667], [99.0, 302.5], [100.0, 303.0], [101.0, 302.8571428571429], [102.0, 304.0], [103.0, 302.3333333333333], [104.0, 302.3333333333333], [105.0, 302.7142857142857], [106.0, 302.83333333333337], [107.0, 303.5], [108.0, 302.0], [109.0, 302.6666666666667], [110.0, 304.3333333333333], [111.0, 302.0], [112.0, 302.1428571428571], [113.0, 302.0], [114.0, 302.3333333333333], [115.0, 302.5], [116.0, 301.8], [117.0, 302.5], [118.0, 302.75], [119.0, 302.0], [120.0, 302.7142857142857], [121.0, 303.3333333333333], [122.0, 302.0], [123.0, 301.8], [124.0, 302.0], [125.0, 302.5], [126.0, 302.6666666666667], [127.0, 302.0], [128.0, 303.16666666666663], [130.0, 303.3333333333333], [131.0, 302.5], [132.0, 302.25], [133.0, 302.0], [134.0, 302.3333333333333], [135.0, 302.3333333333333], [136.0, 302.45000000000005], [137.0, 302.42857142857144], [139.0, 302.5], [140.0, 302.16666666666663], [141.0, 301.8], [142.0, 303.0], [143.0, 302.5], [144.0, 302.0], [145.0, 303.25], [146.0, 302.5], [147.0, 302.0], [148.0, 302.8333333333333], [149.0, 302.0], [150.0, 301.2], [151.0, 301.625], [152.0, 301.0], [153.0, 301.6666666666667], [154.0, 302.5], [155.0, 302.25], [156.0, 302.42857142857144], [157.0, 302.0], [158.0, 301.2857142857143], [159.0, 303.0], [160.0, 301.25], [161.0, 301.6], [162.0, 301.6666666666667], [163.0, 302.0], [164.0, 301.3333333333333], [165.0, 301.0], [166.0, 302.0], [167.0, 301.6666666666667], [168.0, 303.0], [169.0, 301.8], [170.0, 302.0], [171.0, 302.0], [172.0, 302.25], [173.0, 302.6666666666667], [174.0, 302.2], [175.0, 301.6], [176.0, 302.37499999999994], [177.0, 301.0], [178.0, 301.42857142857144], [179.0, 301.875], [181.0, 301.2], [182.0, 301.6666666666667], [183.0, 302.0], [184.0, 301.5], [185.0, 301.16666666666663], [186.0, 301.0], [187.0, 301.2], [188.0, 301.4], [189.0, 301.6], [190.0, 301.4], [191.0, 301.3333333333333], [192.0, 302.00000000000006], [193.0, 301.8571428571429], [194.0, 302.0], [196.0, 301.7142857142857], [197.0, 302.05], [198.0, 302.16666666666663], [199.0, 301.44444444444446], [203.0, 313.60869565217394], [204.0, 302.4], [205.0, 301.25], [206.0, 302.9166666666667], [207.0, 302.5], [202.0, 304.5], [208.0, 302.3846153846154], [209.0, 302.33333333333337], [210.0, 304.5], [211.0, 302.5], [212.0, 301.1111111111111], [213.0, 303.5], [214.0, 303.00000000000006], [215.0, 302.4], [216.0, 302.0], [217.0, 302.57142857142856], [218.0, 303.1111111111111], [219.0, 303.09999999999997], [220.0, 302.125], [221.0, 302.0], [222.0, 302.6666666666667], [223.0, 301.75], [224.0, 305.5], [225.0, 302.3999999999999], [226.0, 303.0], [227.0, 302.25], [228.0, 301.4285714285714], [229.0, 303.5], [230.0, 304.5], [231.0, 308.0], [233.0, 305.92], [234.0, 303.3076923076923], [235.0, 303.4], [236.0, 301.6666666666667], [237.0, 301.0], [238.0, 302.3333333333333], [239.0, 304.75], [232.0, 307.4], [240.0, 302.8235294117647], [242.0, 302.1875], [243.0, 304.7692307692308], [244.0, 301.14285714285717], [246.0, 302.8571428571429], [247.0, 302.79999999999995], [245.0, 310.0], [241.0, 309.6666666666667], [248.0, 303.0], [249.0, 303.5833333333333], [251.0, 300.92307692307696], [252.0, 303.0], [253.0, 301.0], [254.0, 302.74999999999994], [255.0, 308.66666666666663], [250.0, 309.25], [257.0, 302.2727272727273], [256.0, 301.5925925925926], [258.0, 305.3333333333333], [259.0, 303.375], [260.0, 302.0], [261.0, 305.3333333333333], [262.0, 305.0], [263.0, 302.28], [264.0, 302.52941176470586], [270.0, 302.08333333333337], [271.0, 302.61538461538464], [268.0, 302.2222222222223], [269.0, 305.0], [265.0, 305.2], [266.0, 301.8666666666666], [267.0, 303.0], [273.0, 301.0], [272.0, 302.0], [274.0, 303.29999999999995], [284.0, 300.8571428571429], [285.0, 302.41666666666663], [286.0, 301.23999999999995], [287.0, 302.45454545454544], [276.0, 302.44444444444446], [277.0, 301.8888888888889], [279.0, 301.93333333333334], [278.0, 309.0], [280.0, 301.81818181818187], [281.0, 301.875], [282.0, 302.14285714285717], [283.0, 301.8181818181818], [290.0, 303.5714285714286], [288.0, 301.1111111111111], [289.0, 308.5], [291.0, 303.5], [300.0, 302.6], [301.0, 300.83333333333337], [302.0, 302.4166666666667], [303.0, 302.1111111111111], [292.0, 302.0], [293.0, 301.44444444444446], [294.0, 303.6666666666667], [295.0, 302.2727272727272], [296.0, 301.75], [297.0, 301.55555555555554], [298.0, 301.1111111111111], [299.0, 302.0], [305.0, 301.12500000000006], [304.0, 302.1818181818182], [306.0, 300.75], [307.0, 302.25], [308.0, 301.0909090909091], [309.0, 305.0], [310.0, 301.52941176470586], [311.0, 301.5], [312.0, 301.5], [318.0, 302.44999999999993], [319.0, 301.42857142857144], [316.0, 301.75757575757575], [317.0, 304.0], [313.0, 301.4285714285714], [314.0, 301.625], [315.0, 302.2], [321.0, 303.83333333333337], [320.0, 303.25], [322.0, 301.3333333333333], [323.0, 301.3809523809524], [324.0, 301.0], [325.0, 302.3333333333333], [326.0, 301.6428571428571], [327.0, 301.45454545454544], [328.0, 301.37500000000006], [334.0, 301.09999999999997], [335.0, 305.0], [332.0, 302.26666666666665], [333.0, 301.0], [329.0, 301.09999999999997], [330.0, 301.72727272727275], [331.0, 301.8181818181818], [337.0, 301.56250000000006], [336.0, 302.0555555555556], [338.0, 301.3636363636364], [339.0, 301.84615384615387], [340.0, 302.3], [341.0, 301.125], [342.0, 301.5333333333333], [343.0, 301.2], [344.0, 301.58333333333337], [350.0, 301.4], [351.0, 301.6], [348.0, 302.90909090909093], [349.0, 302.0], [345.0, 301.4], [346.0, 301.50000000000006], [347.0, 302.11111111111114], [353.0, 302.33333333333337], [352.0, 301.8181818181818], [354.0, 301.0], [355.0, 301.1666666666667], [356.0, 301.45454545454555], [357.0, 301.8], [358.0, 301.3125], [359.0, 301.09999999999997], [360.0, 301.0], [366.0, 301.59090909090907], [367.0, 301.625], [364.0, 301.3333333333333], [365.0, 301.0], [361.0, 301.16666666666663], [362.0, 301.45454545454544], [363.0, 300.45454545454544], [369.0, 301.1], [368.0, 301.07142857142856], [370.0, 302.0769230769231], [371.0, 302.125], [372.0, 301.5625], [373.0, 302.16666666666674], [374.0, 301.45454545454544], [375.0, 301.4285714285714], [376.0, 302.64516129032256], [382.0, 303.8], [383.0, 301.2857142857143], [380.0, 301.6666666666667], [381.0, 302.66666666666663], [377.0, 302.0], [378.0, 302.7272727272728], [379.0, 301.1428571428571], [385.0, 302.0], [384.0, 302.0833333333333], [386.0, 301.75000000000006], [387.0, 301.2142857142857], [388.0, 302.0833333333334], [389.0, 301.14285714285717], [390.0, 301.3636363636364], [391.0, 301.4], [392.0, 302.0], [398.0, 301.57142857142856], [399.0, 301.76923076923083], [396.0, 301.3076923076923], [397.0, 301.1111111111111], [393.0, 301.8666666666666], [394.0, 301.6153846153846], [395.0, 302.15384615384613], [401.0, 301.09090909090907], [400.0, 301.38461538461536], [402.0, 300.9166666666667], [403.0, 301.6153846153846], [404.0, 301.0714285714286], [405.0, 301.3846153846154], [406.0, 301.6206896551724], [407.0, 302.0], [408.0, 303.59999999999997], [414.0, 302.0], [415.0, 301.0], [412.0, 301.25], [413.0, 301.5555555555556], [409.0, 301.9411764705882], [410.0, 302.4166666666667], [411.0, 300.83333333333337], [417.0, 301.5714285714286], [416.0, 302.0833333333333], [418.0, 302.0], [419.0, 301.78571428571433], [420.0, 303.2], [421.0, 302.6470588235294], [422.0, 302.0], [423.0, 301.99999999999994], [424.0, 301.31249999999994], [430.0, 301.64285714285717], [431.0, 301.2727272727273], [428.0, 301.9375], [429.0, 301.21428571428567], [425.0, 303.0], [426.0, 302.5652173913043], [427.0, 301.49999999999994], [433.0, 300.8636363636364], [432.0, 301.8181818181818], [434.0, 301.0], [435.0, 301.27777777777777], [436.0, 302.92307692307696], [437.0, 302.875], [438.0, 302.5882352941176], [439.0, 301.74999999999994], [440.0, 301.75], [446.0, 301.1333333333333], [447.0, 302.1], [444.0, 301.2666666666667], [445.0, 301.70588235294116], [441.0, 301.16666666666663], [442.0, 301.4545454545455], [443.0, 302.34210526315786], [449.0, 301.4117647058824], [448.0, 301.8], [450.0, 302.9], [451.0, 301.3888888888889], [452.0, 301.64285714285717], [453.0, 301.93333333333334], [454.0, 301.4444444444445], [455.0, 302.4375], [456.0, 301.80000000000007], [462.0, 301.3636363636363], [463.0, 301.22222222222223], [460.0, 302.58333333333337], [461.0, 301.1666666666667], [457.0, 301.6], [458.0, 302.64285714285717], [459.0, 301.2857142857143], [465.0, 301.2631578947368], [464.0, 301.5], [466.0, 302.5769230769231], [467.0, 302.0], [468.0, 300.9333333333333], [469.0, 301.41666666666674], [470.0, 301.16666666666663], [471.0, 301.59999999999997], [472.0, 302.56249999999994], [479.0, 301.625], [476.0, 301.4347826086957], [477.0, 302.3333333333333], [478.0, 301.62499999999994], [473.0, 301.9714285714286], [474.0, 301.3571428571429], [475.0, 301.46153846153845], [481.0, 300.9444444444444], [480.0, 301.27777777777777], [482.0, 301.4], [483.0, 301.0], [484.0, 301.3529411764706], [485.0, 303.0], [486.0, 301.70967741935476], [487.0, 301.5333333333333], [488.0, 301.2142857142857], [494.0, 302.9375], [495.0, 301.18750000000006], [492.0, 301.6363636363636], [493.0, 301.73333333333335], [489.0, 301.37500000000006], [490.0, 302.13333333333344], [491.0, 302.77777777777777], [498.0, 301.5806451612903], [496.0, 302.3333333333333], [497.0, 303.0], [499.0, 301.15384615384613], [508.0, 301.9583333333333], [509.0, 302.22222222222223], [510.0, 300.94117647058823], [511.0, 302.18181818181824], [500.0, 302.0], [501.0, 302.8333333333333], [502.0, 302.70588235294116], [503.0, 301.9393939393938], [504.0, 301.43749999999994], [505.0, 302.2857142857142], [506.0, 301.7647058823529], [507.0, 302.5333333333333], [515.0, 300.75], [512.0, 301.61538461538464], [526.0, 303.12903225806446], [527.0, 302.8235294117647], [524.0, 301.84848484848493], [525.0, 302.0], [522.0, 301.0], [523.0, 301.0], [513.0, 302.8], [514.0, 301.5], [516.0, 302.0263157894737], [517.0, 302.40000000000003], [518.0, 302.125], [519.0, 301.52631578947364], [528.0, 302.4761904761905], [542.0, 301.6296296296296], [543.0, 301.6363636363636], [540.0, 326.04878048780483], [538.0, 305.0], [541.0, 305.9302325581396], [536.0, 301.92857142857144], [537.0, 302.6666666666667], [529.0, 301.61111111111114], [530.0, 301.5], [531.0, 302.30769230769226], [532.0, 302.0], [533.0, 302.7567567567568], [534.0, 302.0526315789473], [535.0, 301.89473684210526], [520.0, 302.95], [521.0, 301.00000000000006], [547.0, 301.3], [544.0, 301.6666666666667], [558.0, 301.45161290322585], [559.0, 300.77777777777777], [556.0, 302.3939393939394], [557.0, 302.45], [554.0, 301.65000000000003], [555.0, 301.44444444444446], [545.0, 301.2068965517242], [546.0, 301.73333333333335], [548.0, 302.13043478260875], [549.0, 301.73333333333335], [550.0, 301.1666666666667], [551.0, 301.4444444444445], [560.0, 301.8], [574.0, 302.24999999999994], [575.0, 301.79310344827593], [572.0, 301.6666666666667], [573.0, 300.95454545454544], [570.0, 305.2388059701493], [569.0, 304.0], [568.0, 304.0], [571.0, 301.9523809523809], [561.0, 302.49999999999994], [562.0, 301.6216216216217], [563.0, 301.2105263157895], [564.0, 301.6], [565.0, 300.6842105263157], [566.0, 302.08333333333337], [552.0, 300.91304347826093], [553.0, 302.2857142857142], [579.0, 301.8], [576.0, 300.9545454545455], [591.0, 303.0], [589.0, 302.00000000000006], [590.0, 302.05882352941165], [586.0, 302.1562500000001], [587.0, 309.6666666666667], [588.0, 302.09999999999997], [577.0, 301.2222222222222], [578.0, 300.64705882352945], [580.0, 301.29411764705884], [581.0, 300.95], [582.0, 300.94444444444446], [583.0, 302.93749999999994], [592.0, 301.4864864864865], [606.0, 301.0], [607.0, 301.2], [604.0, 300.99999999999994], [605.0, 302.27777777777766], [602.0, 301.7142857142857], [603.0, 302.0], [600.0, 303.3378378378378], [601.0, 303.27777777777777], [593.0, 301.3783783783783], [594.0, 301.1666666666667], [595.0, 301.2], [596.0, 301.8461538461538], [598.0, 302.0], [599.0, 303.57142857142856], [584.0, 301.28571428571416], [585.0, 301.09090909090907], [611.0, 301.5263157894737], [608.0, 301.1111111111111], [622.0, 301.2142857142858], [623.0, 301.1351351351351], [620.0, 302.3], [621.0, 302.3333333333333], [618.0, 301.7142857142857], [619.0, 300.875], [609.0, 302.88], [610.0, 302.11764705882354], [612.0, 301.72727272727275], [613.0, 302.72727272727275], [614.0, 301.0], [615.0, 303.09090909090907], [624.0, 304.38888888888886], [638.0, 302.0416666666667], [636.0, 301.90000000000003], [637.0, 301.15789473684214], [634.0, 300.75], [635.0, 301.94736842105266], [632.0, 301.7096774193548], [633.0, 301.74999999999994], [625.0, 301.40000000000003], [626.0, 301.0769230769231], [627.0, 314.5], [628.0, 302.25], [629.0, 308.0], [630.0, 307.5], [631.0, 303.9347826086956], [616.0, 301.0909090909091], [617.0, 303.0], [658.0, 305.0], [640.0, 303.34782608695656], [654.0, 305.0], [651.0, 309.5], [650.0, 309.5], [648.0, 305.0], [668.0, 304.0], [666.0, 304.0], [665.0, 306.25], [646.0, 305.0], [645.0, 314.0], [643.0, 305.0], [642.0, 305.0], [663.0, 304.0], [662.0, 304.3333333333333], [661.0, 305.0], [657.0, 305.0], [656.0, 305.0], [683.0, 489.55555555555554], [680.0, 634.5964912280702], [681.0, 565.0243902439023], [682.0, 480.8256410256409], [684.0, 706.1884057971013], [685.0, 694.1724137931036], [686.0, 743.8571428571429], [687.0, 313.0], [679.0, 313.0], [677.0, 304.0], [676.0, 304.0], [673.0, 304.0], [672.0, 304.0], [693.0, 312.0], [689.0, 304.0], [710.0, 397.5409836065574], [715.0, 355.75163398692814], [711.0, 483.64285714285717], [729.0, 303.3333333333333], [730.0, 304.0], [732.0, 310.6], [733.0, 305.3333333333333], [734.0, 302.0], [735.0, 301.0], [720.0, 307.6666666666667], [721.0, 302.3333333333333], [723.0, 304.75], [724.0, 303.0], [725.0, 301.0], [726.0, 305.8], [727.0, 304.0], [712.0, 319.78980891719743], [713.0, 344.25000000000006], [714.0, 340.2448979591837], [716.0, 381.95], [717.0, 318.34374999999994], [718.0, 302.0], [719.0, 302.0], [743.0, 309.9354838709678], [738.0, 303.0], [736.0, 302.0], [737.0, 313.0], [750.0, 303.0], [751.0, 302.5], [748.0, 317.06756756756755], [749.0, 316.04347826086945], [740.0, 302.2448979591837], [741.0, 301.25], [742.0, 304.29629629629625], [752.0, 302.0], [767.0, 302.0], [765.0, 302.0], [766.0, 301.0], [763.0, 301.0], [764.0, 304.3333333333333], [761.0, 302.0], [762.0, 301.3333333333333], [753.0, 303.0], [754.0, 301.3333333333333], [755.0, 304.75], [756.0, 301.3333333333333], [757.0, 301.0], [758.0, 304.0], [759.0, 301.0], [744.0, 315.11718749999994], [745.0, 314.25333333333356], [746.0, 309.5753424657534], [747.0, 314.8206896551723], [771.0, 303.75], [768.0, 304.0], [782.0, 303.83333333333337], [783.0, 306.5714285714286], [780.0, 300.6666666666667], [781.0, 301.0], [778.0, 310.7216494845361], [779.0, 307.83333333333337], [769.0, 303.0], [770.0, 301.41666666666674], [772.0, 301.0892857142858], [773.0, 302.6], [774.0, 305.8260869565215], [775.0, 308.5365853658537], [784.0, 300.6666666666667], [798.0, 302.8], [799.0, 302.13793103448273], [796.0, 301.3333333333333], [797.0, 307.75], [794.0, 301.5], [795.0, 304.8571428571429], [792.0, 303.5], [793.0, 301.0], [785.0, 301.6666666666667], [786.0, 306.75], [787.0, 300.6666666666667], [788.0, 303.0], [789.0, 303.5], [790.0, 301.0], [791.0, 301.5], [776.0, 304.5581395348839], [777.0, 305.97058823529414], [803.0, 300.91999999999996], [800.0, 302.5675675675676], [814.0, 301.25], [815.0, 301.66666666666663], [812.0, 302.14285714285717], [813.0, 302.6], [810.0, 304.57142857142856], [811.0, 301.0], [801.0, 301.0], [802.0, 301.31999999999994], [804.0, 302.2878787878787], [805.0, 304.794642857143], [806.0, 303.5941176470586], [807.0, 301.95], [816.0, 302.6666666666667], [830.0, 302.1818181818182], [831.0, 301.0833333333333], [828.0, 302.0], [829.0, 301.68181818181824], [826.0, 301.6], [827.0, 301.25], [824.0, 302.2], [825.0, 303.25], [817.0, 301.33333333333337], [818.0, 301.0], [819.0, 301.5], [820.0, 303.2857142857143], [821.0, 301.0], [822.0, 301.5], [823.0, 301.7142857142857], [808.0, 303.03472222222234], [809.0, 304.3802816901409], [839.0, 303.3809523809524], [835.0, 302.82608695652175], [832.0, 302.12000000000006], [847.0, 304.0], [846.0, 304.0], [845.0, 304.375], [843.0, 304.0], [842.0, 305.0], [841.0, 304.0], [840.0, 304.0], [833.0, 301.13793103448285], [834.0, 302.3125000000001], [836.0, 304.0828402366864], [837.0, 301.846153846154], [838.0, 303.009009009009], [854.0, 396.5188679245283], [856.0, 303.0], [857.0, 301.6363636363636], [858.0, 300.0], [859.0, 301.7631578947367], [860.0, 301.47222222222223], [861.0, 301.8000000000001], [862.0, 301.50000000000006], [863.0, 300.99999999999994], [851.0, 303.0], [850.0, 304.0], [849.0, 305.5], [855.0, 301.25], [867.0, 300.72093023255815], [864.0, 301.1473684210526], [865.0, 301.7105263157895], [866.0, 302.7052631578948], [868.0, 301.9674796747968], [888.0, 301.8235294117647], [889.0, 301.6666666666667], [890.0, 301.85714285714283], [891.0, 300.99999999999994], [892.0, 300.92063492063494], [893.0, 300.8070175438596], [894.0, 300.96330275229354], [895.0, 300.9468085106383], [883.0, 305.0], [884.0, 357.0514285714284], [885.0, 301.6666666666667], [886.0, 302.0], [887.0, 301.4545454545455], [902.0, 302.0], [897.0, 302.48437500000006], [896.0, 301.94214876033067], [910.0, 304.0], [911.0, 302.0], [898.0, 302.53846153846155], [900.0, 302.3333333333333], [901.0, 302.5], [912.0, 303.0], [926.0, 302.0227272727273], [927.0, 302.2405063291139], [924.0, 301.07741935483875], [925.0, 301.06976744186056], [922.0, 301.12499999999994], [923.0, 301.144927536232], [920.0, 301.6333333333334], [903.0, 303.0], [921.0, 300.97058823529414], [914.0, 304.8435754189944], [915.0, 301.0], [916.0, 301.0], [917.0, 300.1428571428571], [918.0, 301.34], [919.0, 301.8461538461538], [904.0, 303.25], [905.0, 302.6666666666667], [907.0, 302.25], [909.0, 305.5], [931.0, 302.0], [928.0, 304.12962962962973], [943.0, 301.13888888888886], [941.0, 301.5], [942.0, 300.8], [939.0, 302.8], [938.0, 301.0], [940.0, 301.4], [929.0, 301.0], [930.0, 301.3333333333333], [932.0, 302.0], [933.0, 301.3333333333333], [934.0, 302.0], [935.0, 302.0], [944.0, 302.95890410958896], [958.0, 300.0], [959.0, 301.5], [956.0, 300.9672131147542], [957.0, 301.4036697247707], [954.0, 301.5929203539825], [955.0, 301.6268656716418], [952.0, 301.5660377358492], [953.0, 301.5121951219513], [945.0, 300.5], [946.0, 300.8888888888888], [947.0, 300.8888888888888], [948.0, 301.2093023255814], [949.0, 301.04347826086956], [950.0, 301.1764705882353], [951.0, 301.17499999999995], [936.0, 302.0], [937.0, 301.2], [963.0, 301.3333333333333], [960.0, 300.5], [974.0, 302.44628099173536], [975.0, 300.57142857142856], [972.0, 301.0], [973.0, 301.0769230769232], [970.0, 301.3333333333333], [971.0, 301.3333333333333], [961.0, 301.0], [962.0, 300.90000000000003], [964.0, 301.0], [965.0, 301.0], [966.0, 301.25], [967.0, 300.5], [976.0, 300.77777777777777], [990.0, 301.0], [991.0, 301.0], [988.0, 301.25], [989.0, 300.75], [986.0, 300.9512195121951], [987.0, 301.07843137254895], [984.0, 301.6249999999999], [985.0, 301.98387096774206], [977.0, 301.62500000000006], [978.0, 300.85714285714283], [979.0, 301.60606060606057], [980.0, 301.0975609756098], [981.0, 301.07894736842104], [982.0, 301.09523809523813], [983.0, 301.50931677018605], [968.0, 301.5], [969.0, 301.4], [995.0, 301.0], [992.0, 301.0], [993.0, 302.3333333333333], [994.0, 301.0], [996.0, 301.125], [997.0, 301.0], [998.0, 301.2], [999.0, 300.4], [1000.0, 335.9644954287057], [1.0, 26040.0]], "isOverall": false, "label": "process-non-blocking", "isController": false}, {"data": [[993.6817812410303, 335.7547600836009]], "isOverall": false, "label": "process-non-blocking-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 1000.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 0.0, "minX": 1.52282802E12, "maxY": 630899.0166666667, "series": [{"data": [[1.52282814E12, 630899.0166666667], [1.52282808E12, 598403.7], [1.52282826E12, 597553.6666666666], [1.5228282E12, 620092.4], [1.52282838E12, 33.96666666666667], [1.52282832E12, 484941.11666666664], [1.52282802E12, 97733.61666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52282814E12, 454313.6], [1.52282808E12, 467870.0], [1.52282826E12, 445528.2], [1.5228282E12, 461364.8], [1.52282838E12, 0.0], [1.52282832E12, 322743.2], [1.52282802E12, 92362.4]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52282838E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 309.82522167487645, "minX": 1.52282802E12, "maxY": 26040.0, "series": [{"data": [[1.52282814E12, 335.78097583414547], [1.52282808E12, 328.41904265819045], [1.52282826E12, 343.09968162913833], [1.5228282E12, 333.30789808917206], [1.52282838E12, 26040.0], [1.52282832E12, 346.6563953351551], [1.52282802E12, 309.82522167487645]], "isOverall": false, "label": "process-non-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52282838E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 0.0, "minX": 1.52282802E12, "maxY": 323.93405150928135, "series": [{"data": [[1.52282814E12, 318.6111248232965], [1.52282808E12, 314.79099133676715], [1.52282826E12, 320.18621540227286], [1.5228282E12, 323.93405150928135], [1.52282838E12, 0.0], [1.52282832E12, 314.5801720689871], [1.52282802E12, 309.8226038001425]], "isOverall": false, "label": "process-non-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52282838E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 0.20458831808585531, "minX": 1.52282802E12, "maxY": 26040.0, "series": [{"data": [[1.52282814E12, 4.459835752911338], [1.52282808E12, 1.7980151332382612], [1.52282826E12, 4.803935178545853], [1.5228282E12, 3.5206812517308594], [1.52282838E12, 26040.0], [1.52282832E12, 4.898554589159888], [1.52282802E12, 0.20458831808585531]], "isOverall": false, "label": "process-non-blocking", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52282838E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 300.0, "minX": 1.52282802E12, "maxY": 3931.0, "series": [{"data": [[1.52282814E12, 3917.0], [1.52282808E12, 2265.0], [1.52282826E12, 2291.0], [1.5228282E12, 3909.0], [1.52282832E12, 3931.0], [1.52282802E12, 780.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52282814E12, 300.0], [1.52282808E12, 300.0], [1.52282826E12, 300.0], [1.5228282E12, 300.0], [1.52282832E12, 300.0], [1.52282802E12, 300.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52282814E12, 379.0], [1.52282808E12, 414.0], [1.52282826E12, 436.0], [1.5228282E12, 431.0], [1.52282832E12, 342.0], [1.52282802E12, 308.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52282814E12, 478.0], [1.52282808E12, 483.0], [1.52282826E12, 470.0], [1.5228282E12, 503.0], [1.52282832E12, 433.0], [1.52282802E12, 322.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52282814E12, 451.0], [1.52282808E12, 446.0], [1.52282826E12, 448.0], [1.5228282E12, 463.0], [1.52282832E12, 379.0], [1.52282802E12, 310.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52282832E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 2.0, "minX": 0.0, "maxY": 26040.0, "series": [{"data": [[592.0, 303.0], [9.0, 314.0], [39.0, 307.0], [905.0, 313.0], [971.0, 307.0], [125.0, 307.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 26040.0], [592.0, 2.0], [9.0, 63.0], [39.0, 74.0], [905.0, 149.5], [971.0, 57.0], [125.0, 66.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 971.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 0.0, "minX": 0.0, "maxY": 314.0, "series": [{"data": [[592.0, 303.0], [9.0, 314.0], [39.0, 307.0], [905.0, 313.0], [971.0, 307.0], [125.0, 307.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[0.0, 0.0], [592.0, 0.0], [9.0, 0.0], [39.0, 0.0], [905.0, 0.0], [971.0, 0.0], [125.0, 0.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 971.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 608.7333333333333, "minX": 1.52282802E12, "maxY": 3039.6833333333334, "series": [{"data": [[1.52282814E12, 2971.133333333333], [1.52282808E12, 3039.6833333333334], [1.52282826E12, 2905.4666666666667], [1.5228282E12, 3009.116666666667], [1.52282832E12, 2108.4666666666667], [1.52282802E12, 608.7333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52282832E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52282802E12, "maxY": 2999.1666666666665, "series": [{"data": [[1.52282814E12, 2912.266666666667], [1.52282808E12, 2999.1666666666665], [1.52282826E12, 2855.95], [1.5228282E12, 2957.4666666666667], [1.52282832E12, 2068.866666666667], [1.52282802E12, 592.0666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52282814E12, 0.2833333333333333], [1.52282808E12, 0.03333333333333333], [1.52282826E12, 0.31666666666666665], [1.5228282E12, 0.16666666666666666], [1.52282838E12, 0.016666666666666666], [1.52282832E12, 0.21666666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.ConnectException", "isController": false}, {"data": [[1.52282814E12, 58.583333333333336], [1.52282808E12, 40.46666666666667], [1.52282826E12, 49.15], [1.5228282E12, 51.53333333333333], [1.52282832E12, 56.03333333333333], [1.52282802E12, 0.016666666666666666]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52282838E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.016666666666666666, "minX": 1.52282802E12, "maxY": 2999.1666666666665, "series": [{"data": [[1.52282814E12, 58.86666666666667], [1.52282808E12, 40.5], [1.52282826E12, 49.46666666666667], [1.5228282E12, 51.7], [1.52282838E12, 0.016666666666666666], [1.52282832E12, 56.25], [1.52282802E12, 0.016666666666666666]], "isOverall": false, "label": "process-non-blocking-failure", "isController": false}, {"data": [[1.52282814E12, 2912.266666666667], [1.52282808E12, 2999.1666666666665], [1.52282826E12, 2855.95], [1.5228282E12, 2957.4666666666667], [1.52282832E12, 2068.866666666667], [1.52282802E12, 592.0666666666667]], "isOverall": false, "label": "process-non-blocking-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52282838E12, "title": "Transactions Per Second"}},
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
