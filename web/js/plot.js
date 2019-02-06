/**
 * plot.js
 *
 * Copyright 2019. All Rights Reserved.
 *
 * Created: February 04, 2019
 * Authors: Toki Migimatsu
 */

function init_plot() {

  var margin = {top: 50, right: 50, bottom: 50, left: 50 };
  var width = d3.select("#console").node().clientWidth;
  var height = d3.select("#console").node().clientHeight;;
  // var n = 200;
  var duration = 2 * 60 * 1000;
  var now = Date.now();
  var count = 0;
  var random = d3.randomNormal(0, 0.2);
  var stroke = 3;

  // var x_scale = d3.scaleLinear()
  //     .domain([0, n - 1])
  //     .range([0, width - margin.left - margin.right]);
  // var y_scale = d3.scaleLinear()
  //     .domain([-1, 1])
  //     .range([height - margin.top - margin.bottom, 0]);

  var tooltip = d3.select("#plot").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  var data = [{ t: now, val: 0 }];
  // d3.range(n).map(function() { return 0; });
  var x = d3.scaleTime()
    .domain([now - duration, now])
    .range([0, width - margin.left - margin.right]);
  var x_new = d3.scaleTime()
    .domain([now - duration, now])
    .range([0, width - margin.left - margin.right]);
  var y = d3.scaleLinear()
    .range([height - margin.top - margin.bottom, 0]);

  var line = d3.line()
    .x(function(d) { return x(d.t); })
    .y(function(d) { return y(d.val); })
    .curve(d3.curveMonotoneX);

  var svg = d3.select("#plot").append("svg")
    .attr("width", width)
    .attr("height", height)
    .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x_axis = svg.append("g")
    .attr("transform", "translate(0," + (height - margin.top - margin.bottom) + ")")
    .call(d3.axisBottom(x));

  var y_axis = svg.append("g")
    .call(d3.axisLeft(y));

  svg.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width - margin.left - margin.right)
    .attr("height", height - margin.top - margin.bottom);

  var path = svg.append("g")
    .attr("clip-path", "url(#clip)")
    .append("path")
    .datum(data)
    .attr("fill", "none")
    .attr("stroke", "steelblue")
    .attr("stroke-width", stroke)

    svg.selectAll(".dot")
    .data(data)
    .enter().append("circle")
    .attr("class", "dot")
    .attr("cx", function(d) { return x(d.t); })
    .attr("cy", function(d) { return y(d.val); })
    .attr("r", 5)
    .on("mouseover", function(d, i) {
      var circle = d3.select(this);
      circle.attr("class", "dot-focus");

      var bbox = path.node().getBoundingClientRect();
      var tooltip_left = bbox.x + parseFloat(circle.attr("cx")) - 0.5 * tooltip.node().clientWidth;
      var tooltip_top = bbox.y + parseFloat(circle.attr("cy")) - 30 - tooltip.node().clientHeight;
      tooltip.html(i + ": " + d)
        .style("left", tooltip_left + "px")
        .style("top", tooltip_top + "px");

      tooltip_left = bbox.x + parseFloat(circle.attr("cx")) - 0.5 * tooltip.node().clientWidth;
      tooltip_top = bbox.y + parseFloat(circle.attr("cy")) - 30 - tooltip.node().clientHeight;
      tooltip.style("left", tooltip_left + "px")
        .style("top", tooltip_top + "px")
        .transition()
        .duration(200)
        .style("opacity", 0.5);
    })
  .on("mouseout", function() {
    d3.select(this).attr("class", "dot");

    tooltip.transition()
      .duration(500)
      .style("opacity", 0);
  });

  function tick(d) {
    now = new Date();
    while (data.length > 1 && x(data[1].t) < 0) {
      data.shift();
    }
    data.push({ t: now, val: random()});

    var t_curr = data[data.length - 1].t;
    var t_prev = data[data.length - 1].t;
    var dt = x(t_curr) - x(t_prev);
    x.domain([t_curr - duration, t_curr])

      var y_min = Math.min(0, d3.min(data, function(d) { return d.val; }));
    var y_max = Math.max(0, d3.max(data, function(d) { return d.val; }));
    var stroke_offset = 0.5 * stroke * (y_max - y_min) / (y.range()[0] - y.range()[1]);
    y.domain([y_min - stroke_offset, y_max + stroke_offset]);


    path.attr("d", line)
      // .attr("transform", "translate(" + dt + ",0)");

      x_axis.call(d3.axisBottom(x));
    y_axis.call(d3.axisLeft(y));
    // x_axis.transition()
    //     .call(d3.axisBottom(x));
    // y_axis.transition()
    //     .call(d3.axisLeft(y));
    // path.transition()
    //     .attr("transform", "translate(0,0)");

    // setTimeout(tick, 10000 * d3.randomUniform(0, 1)());
  }
  // setTimeout(tick, 10000 * d3.randomUniform(0, 1)());

}

function init_plotly() {
  function rand() {
    return Math.random();
  }

  var time = new Date();

  var data = [{
    x: [time],
    y: [rand],
    mode: 'lines',
    line: {color: '#80CAF6'}
  }];
  var layout = {
    height: $("#console").height(),
    margin: {
      l: 40,
      r: 0,
      t: 20,
      b: 40,
      pad: 4
    }
  };

  var plot = $("#plotly")[0];
  Plotly.plot(plot, data, layout);

  var cnt = 0;

  var updatePlot = function() {

    var time = new Date();

    var update = {
      x:  [[time]],
      y: [[rand()]]
    }

    var olderTime = time.setMinutes(time.getMinutes() - 1);
    var futureTime = time.setMinutes(time.getMinutes() + 1);

    var minuteView = {
      xaxis: {
        type: 'date',
        range: [olderTime,futureTime]
      }
    };

    Plotly.relayout(plot, minuteView);
    Plotly.extendTraces(plot, update, [0])

      if (cnt >= 100) {
        clearInterval(interval);
        setTimeout(function() {
          interval = setInterval(updatePlot, 100);
        }, 10000);
        cnt = 0;
      }
    cnt++;
  }
  var interval = setInterval(updatePlot, 100);
}
// init_plotly();

// init_plot();

function init_smoothie() {
  $("#plotly").html("<canvas></canvas>");
  $("#plotly > canvas").height($("#plotly").height()).width($("#plotly").width());
  var smoothie = new SmoothieChart();
  var delay = 1000;
  smoothie.streamTo($("#plotly > canvas")[0], delay);
  // Data
  var line1 = new TimeSeries();
  var line2 = new TimeSeries();

  // Add a random value to each line every second
  setInterval(function() {
    line1.append(new Date().getTime(), Math.random());
    line2.append(new Date().getTime(), Math.random());
  }, 1000);

  // Add to SmoothieChart
  smoothie.addTimeSeries(line1);
  smoothie.addTimeSeries(line2);
}
// init_smoothie();
