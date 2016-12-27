
/* jshint strict: false, browser: true, globalstrict: true */
/* global require, module */

var JSON_URI = 'profile.json';
var RECORD_URI = 'record';
var STOP_URI = 'stop';
var POLL_INTERVAL = 200;  // msec

var MAIN_CONTENT= "MAIN_CONTENT";
var STATUS_DIV = "STATUS_DIV";
var RECORD_BUTTON = "RECORD_BUTTON";
var STOP_BUTTON = "STOP_BUTTON";
var ZOOM_IN_BUTTON = "ZOOM_IN_BUTTON";
var ZOOM_OUT_BUTTON = "ZOOM_OUT_BUTTON";
var ZOOM_MESSAGE = "ZOOM_MESSAGE";

var d3request = d3;
var d3select = d3;
var d3hierarchy = d3;
var d3scale = d3;

var recording = false;
var MAX_ZOOM = 12;
var MIN_ZOOM = 0;


var zoom_level = 0;
var profile_data = null;

/**
 * Represents CPU flame graph.
 * @constructor
 * @param {Object} parent - Parent element for flame graph.
 * @param {Object} data - Data for flame graph rendering.
 */
function FlameGraph(parent, data, zoom_level) {
  this.PAD_SIZE = 10;
  this.HEIGHT = parent.node().scrollHeight - this.PAD_SIZE;
  this.WIDTH = zoom_level * parent.node().scrollWidth - this.PAD_SIZE;
  this.TEXT_OFFSET_X = 5;
  this.TEXT_OFFSET_Y= 14;
  this.TEXT_CUTOFF = 0.075 * this.WIDTH;
  this.LEGEND_X = this.WIDTH - 400;
  this.LEGEND_Y = 100;
  this.MIN_TEXT_HEIGHT = 18;
  this.HELP_MESSAGE = (
    '<p>&#8226 Hover over node to see node stats</p>' +
    '<p>&#8226 Click on node to zoom</p>'+
    '<p>&#8226 Double click to restore original scale</p>');
  this.NO_DATA_MESSAGE = (
    'Sorry, no samples. Seems like run time is less than sampling interval.');

  this.data_ = data;
  this.parent_ = parent;
  this.xScale_ = d3scale.scaleLinear().domain([0, 1]).range([0, this.WIDTH]);

  var d3TickFormat = d3.format(",.2");
  var tickFormat = function(x) { return d3TickFormat(x) + "s"; };

  this.xAxis_ = d3.axisBottom(d3scale.scaleLinear().domain([0, data.runTime]).range([0, this.WIDTH]))
    .ticks(Math.floor(this.WIDTH/100))
    .tickFormat(tickFormat);

  this.yScale_ = d3scale.scaleLinear().range([0, this.HEIGHT]);
  this.color_ = d3scale.scaleOrdinal(d3scale.schemeCategory20);
  this.flameGraph_ = d3hierarchy.partition();
}

/** Renders flame graph. */
FlameGraph.prototype.render = function() {
  var canvas = this.parent_.append('svg')
    .attr('width', this.WIDTH)
    .attr('height', this.HEIGHT);

  var tooltip = this.parent_.append('div')
    .attr('class', 'content-tooltip content-tooltip-invisible');
  canvas.append("g").call(this.xAxis_);
  this.renderHelp_();

  // Display message and stop if callStats is empty.
  if (Object.keys(this.data_.callStats).length === 0) {
    this.renderNoDataMessage_();
    return;
  }

  var nodes = d3hierarchy.hierarchy(this.data_.callStats)
    .each(function(d) { d.value = d.data.sampleCount; });

  this.flameGraph_(nodes);

  var cells = canvas.selectAll('.flame-graph-cell')
    .data(nodes.descendants())
    .enter()
    .append('g')
    .attr('class', 'flame-graph-cell');

  // Render flame graph nodes.
  var self = this;
  var nodes = cells.append('rect')
    .attr('class', function(d) {
      if (d.data.stack[0] === "") {
        return 'flame-graph-rect-spacer';
      } else {
        return 'flame-graph-rect-normal';
      }
    })
    .attr('x', function(d) { return self.xScale_(d.x0); })
    .attr('y', function(d) { return self.yScale_(1 - d.y0 - (d.y1 - d.y0)); })
    .attr('width', function(d) { return self.xScale_(d.x1 - d.x0); })
    .attr('height', function(d) { return self.yScale_(d.y1 - d.y0); })
    .style('fill', function(d) {
      if (d.data.stack[0] === "") {
        return "rgba(255,255,255,0)"; // Render the gaps as transparent
      } else {
        return self.color_(FlameGraph.getNodeName_(d.data));
      }
    })
    .on('mouseover', function(d) {
      if (d.data.stack[0] !== "") {
        self.showTooltip_(this, tooltip, d.data);
      }
    })
    .on('mouseout', function(d) {
      if (d.data.stack[0] !== "") {
        self.hideTooltip_(this, tooltip);
      }
    });

  var titles = cells.append('text')
    .attr('x', function(d) { return self.xScale_(d.x0) + self.TEXT_OFFSET_X; })
    .attr('y', function(d) {
      return self.yScale_(1 - d.y0 - (d.y1 - d.y0)) + self.TEXT_OFFSET_Y; })
    .text(function(d) {
      if (d.data.stack[0] === "") {
        return "";
      } else {
        var nodeWidth = this.previousElementSibling.getAttribute('width');
        return FlameGraph.getTruncatedNodeName_(d.data, nodeWidth);
      }
    })
    .attr('visibility', function(d) {
      var nodeHeight = this.previousElementSibling.getAttribute('height');
      return nodeHeight > self.MIN_TEXT_HEIGHT ? 'visible': 'hidden';
    });
};

/**
 * Shows tooltip and flame graph node highlighting.
 * @param {Object} element - Element representing flame graph node.
 * @param {Object} tooltip - Element representing tooltip.
 * @param {Object} node - Object representing function call info.
 */
FlameGraph.prototype.showTooltip_ = function(element, tooltip, node) {
  d3select.select(element).attr('class', 'flame-graph-rect-highlight');
  tooltip.attr('class', 'content-tooltip content-tooltip-visible')
    .html('<p>' + Math.floor(node.sampleCount*1000) + 'ms ' + node.stack[0] + '</p>')
    .style('left', d3select.event.pageX + 20)
    .style('top', d3select.event.pageY);
};

/**
 * Hides tooltip and removes node highlighting.
 * @param {Object} element - Element representing highlighted rectangle.
 * @param {Object} tooltip - Element representing tooltip.
 */
FlameGraph.prototype.hideTooltip_ = function(element, tooltip) {
  d3select.select(element).attr('class', 'flame-graph-rect-normal');
  tooltip.attr('class', 'content-tooltip content-tooltip-invisible');
};

/** Renders flame graph help. */
FlameGraph.prototype.renderHelp_ = function() {
  this.parent_.append('div')
    .attr('class', 'tabhelp inactive-tabhelp')
    .html(this.HELP_MESSAGE);
};

/** Renders message when callStats is empty. */
FlameGraph.prototype.renderNoDataMessage_ = function() {
  this.parent_.append('div')
    .attr('class', 'flame-graph-no-data-message')
    .html(this.NO_DATA_MESSAGE);
};

/**
 * Returns function info.
 * @static
 * @param {Object} d - Object representing function call info.
 * @returns {string}
 */
FlameGraph.getNodeName_ = function(d) {
  return d.stack[0];
};

/**
 * Truncates function name depending on flame graph rectangle length.
 * @static
 * @param (Object) d - Object representing function info.
 * @param {number} rectLength - Length of flame graph rectangle.
 * @returns {string}
 */
FlameGraph.getTruncatedNodeName_ = function(d, rectLength) {
  var fullname = FlameGraph.getNodeName_(d);
  var maxSymbols = rectLength / 10;  // Approx. 10 pixels per character.
  if (maxSymbols <= 3) {
    return '';
  } else if (fullname.length > maxSymbols - 3) { // Full name minus ellipsis.
    return fullname.substr(0, maxSymbols) + '...';
  }
  return fullname;
};

/**
 * Renders flame graph and attaches it to parent.
 * @param {Object} parent - Parent element for flame graph.
 * @param {Object} data - Data for flame graph rendering.
 */
function renderFlameGraph(data) {
  var parent = d3select.select('#' + MAIN_CONTENT);
  parent.html("");
  var flameGraph = new FlameGraph(parent, data, zoomLevelToFactor(zoom_level));
  flameGraph.render();
}

/**
 * Creates empty div with specified ID.
 * @param {string} id - div ID.
 */
function createTabContent_(id) {
  return 
}

/**
 * Renders stats page.
 * @param {Object} data - Data for page rendering.
 */
function renderPage() {
  // Remove all existing tabs and their content
  // in case if user is refreshing main page.
  d3select.select('body').selectAll('*').remove();

  var tabHeader = d3select.select('body')
    .append('div')
    .attr('class', 'main-tab-header');

  tabHeader.append('button')
    .attr('id', RECORD_BUTTON)
    .html('<span></span> Record')
    .on('click', handleRecordClick);

  tabHeader.append('button')
    .attr('id', STOP_BUTTON)
    .html('<span></span> Stop')
    .attr('disabled', 'true')
    .on('click', handleStopClick);

  tabHeader.append('div')
    .attr('class', 'status')
    .attr('id', STATUS_DIV);

  tabHeader.append('button')
    .attr('id', ZOOM_OUT_BUTTON)
    .text('Zoom out')
    .on('click', adjustZoomLevel.bind(this, -1))

  tabHeader.append('div')
    .attr('class', 'zoom_level')
    .attr('id', ZOOM_MESSAGE)
    .text("" + Math.floor(100*zoomLevelToFactor(zoom_level)) + "%");

  tabHeader.append('button')
    .attr('id', ZOOM_IN_BUTTON)
    .text('Zoom in')
    .on('click', adjustZoomLevel.bind(this, 1))

  d3select.select('body')
    .append('div')
    .attr('class', 'main-tab-content')
    .attr('id', MAIN_CONTENT)
    .on('wheel', handleWheel)
    .on('mousemove', handleMouseMove)
    .on('mouseleave' ,handleMouseLeave)
    .on('mousedown', handleMouseDown);

  window.addEventListener('resize', function() {
    renderFlameGraph(profile_data);
  });

}

function handleRecordClick() {
  d3select.select('#' + STATUS_DIV).text("Recording...").classed("recording", true);
  d3select.select('#' + RECORD_BUTTON).attr("disabled", "on");
  d3select.select('#' + STOP_BUTTON).attr("disabled", null);
  d3request.request(RECORD_URI).post("", function(data) {});
}

function handleStopClick() {
  d3select.select('#' + STATUS_DIV).text("").classed("recording", false);
  d3select.select('#' + RECORD_BUTTON).attr("disabled", null);
  d3select.select('#' + STOP_BUTTON).attr("disabled", "on");
  d3request.request(STOP_URI).post("", function(data) {
    loadData();
  });
}

function handleWheel() {
  var ev = d3.event;
  ev.stopPropagation();
  ev.preventDefault();
  const delta = -Math.sign(ev.deltaY);

  var main_content = d3select.select('#' + MAIN_CONTENT).node();
  var offsetX = eventRelativeX(ev, main_content);

  var left_offset = offsetX - main_content.scrollLeft;

  if (adjustZoomLevel(delta)) {
    main_content.scrollLeft = zoomCoordAdjust(delta, offsetX) - left_offset;
  }
}

function eventRelativeX(ev, element) {
  var frame_rect = element.getBoundingClientRect();
  return ev.clientX - frame_rect.left + element.scrollLeft;
}

function adjustZoomLevel(adjustment) {
  var orig_zoom_level = zoom_level;
  zoom_level = Math.min(Math.max(zoom_level+adjustment, MIN_ZOOM), MAX_ZOOM);
  if (orig_zoom_level !== zoom_level) {
    d3select.select("#" + ZOOM_MESSAGE).text("" + Math.floor(100*zoomLevelToFactor(zoom_level)) + "%");
    renderFlameGraph(profile_data);
    return true;
  } else {
    return false;
  }
}

function zoomLevelToFactor(zoom_level) {
  return Math.pow(1.5, zoom_level);
}

function zoomCoordAdjust(adjustment, coord) {
  return Math.pow(1.5, adjustment) * coord;
}

var mouse_drag_start_x = null;

function handleMouseMove() {
  var ev = d3.event;
  ev.stopPropagation();
  ev.preventDefault();
  if (mouse_drag_start_x != null && ev.buttons & 1) { // Is LMB down?
    var main_content = d3select.select('#' + MAIN_CONTENT).node();
    main_content.scrollLeft = main_content.scrollLeft - (eventRelativeX(ev, main_content) - mouse_drag_start_x);
  }
}

function handleMouseDown() {
  var ev = d3.event;
  ev.stopPropagation();
  ev.preventDefault();
  var main_content = d3select.select('#' + MAIN_CONTENT).node();
  mouse_drag_start_x = eventRelativeX(ev, main_content);
}

function handleMouseLeave() {
  mouse_drag_start_x = null;
}

function loadData() {
  d3request.json(JSON_URI, function(data) {
    // if (Object.keys(data).length !== 0) {
      // progressIndicator.remove();
      if (data != null) {
        profile_data = data.c;
        renderFlameGraph(profile_data);
      }
    // } else {
    //   var timerId = setInterval(function() {
    //     d3request.json(JSON_URI, function(data) {
    //       if (Object.keys(data).length !== 0) {
    //         progressIndicator.remove();
    //         clearInterval(timerId);
    //         renderFlameGraph(data.c, d3select.select('#' + MAIN_CONTENT));
    //       }
    //     });
    //   }, POLL_INTERVAL);
    // }
  });
}

/** Makes request to server and renders page with received data. */
function main() {
  renderPage();
  loadData();
}

main();
