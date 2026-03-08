<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3";

  export let data: { time: number; value: number }[] = [];
  export let color: string = "#3b82f6";
  export let label: string = "";
  export let unit: string = "";
  export let height: number = 200;
  export let currentTime: number | null = null;

  let container: HTMLDivElement;
  let tooltip: HTMLDivElement;
  let width = 0;

  // Make reactive to data/dimensions/time
  $: if (container && data.length > 0 && width > 0) {
    draw();
  }

  $: if (currentTime !== null && width > 0) {
    updatePlayhead();
  }

  // Keep references to update efficiently
  let playheadSelection: any;
  let xScale: d3.ScaleLinear<number, number>;

  function draw() {
    if (!container) return;
    container.innerHTML = "";

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const svg = d3
      .select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale (Time)
    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.time) || 1])
      .range([0, chartWidth]);
    xScale = x;

    // Y Scale (Value)
    // Handle both positive and negative values by checking extents
    const yExtent = d3.extent(data, (d) => d.value) as [number, number];
    let [minVal, maxVal] = yExtent;

    // Default fallback
    if (minVal === undefined) minVal = 0;
    if (maxVal === undefined) maxVal = 1;

    // Add padding
    const range = maxVal - minVal;
    const pad = range === 0 ? maxVal * 0.1 || 1 : range * 0.1;

    // If we only have positive values, start at 0
    if (minVal >= 0) minVal = 0;

    const y = d3
      .scaleLinear()
      .domain([minVal - pad, maxVal + pad])
      .range([chartHeight, 0]);

    // Area Generator
    const area = d3
      .area<{ time: number; value: number }>()
      .x((d) => x(d.time))
      .y0((d) => y(0)) // Baseline at y=0
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    // Line Generator
    const line = d3
      .line<{ time: number; value: number }>()
      .x((d) => x(d.time))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    // Gradient
    const defs = svg.append("defs");
    const gradientId = `gradient-${label.replace(/\s+/g, "-")}`;
    const gradient = defs
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%");

    gradient
      .append("stop")
      .attr("offset", "0%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0.4);

    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", color)
      .attr("stop-opacity", 0.05);

    // Add Area
    svg
      .append("path")
      .datum(data)
      .attr("fill", `url(#${gradientId})`)
      .attr("d", area);

    // Add Line
    svg
      .append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 2)
      .attr("d", line);

    // Add Zero Line (if within domain)
    if (minVal < 0 && maxVal > 0) {
      svg
        .append("line")
        .attr("x1", 0)
        .attr("x2", chartWidth)
        .attr("y1", y(0))
        .attr("y2", y(0))
        .attr("stroke", "#525252") // neutral-600
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "4 2")
        .attr("opacity", 0.5);
    }

    // Playhead (Vertical Line)
    playheadSelection = svg
      .append("line")
      .attr("y1", 0)
      .attr("y2", chartHeight)
      .attr("stroke", "#ef4444") // Red
      .attr("stroke-width", 2)
      .attr("opacity", 0); // Initially hidden

    updatePlayhead();

    // X Axis
    svg
      .append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(5)
          .tickFormat((d) => `${d}s`),
      )
      .attr("color", "#737373");

    // Y Axis
    svg.append("g").call(d3.axisLeft(y).ticks(5)).attr("color", "#737373");

    // Overlay for tooltip
    const overlay = svg
      .append("rect")
      .attr("width", chartWidth)
      .attr("height", chartHeight)
      .attr("fill", "transparent")
      .on("mousemove", (event) => {
        const [mx] = d3.pointer(event);
        const t = x.invert(mx);

        // Find closest data point
        const bisect = d3.bisector((d: any) => d.time).center;
        const i = bisect(data, t);
        const d = data[i];

        if (d && tooltip) {
          tooltip.style.opacity = "1";
          tooltip.style.left = `${event.pageX + 10}px`;
          tooltip.style.top = `${event.pageY - 20}px`;
          tooltip.innerHTML = `
            <div class="font-bold">${label}</div>
            <div>Time: ${d.time.toFixed(2)}s</div>
            <div>Value: ${d.value.toFixed(2)} ${unit}</div>
          `;

          // Draw cursor line
          cursor.attr("x1", x(d.time)).attr("x2", x(d.time)).attr("opacity", 1);
          cursorDot
            .attr("cx", x(d.time))
            .attr("cy", y(d.value))
            .attr("opacity", 1);
        }
      })
      .on("mouseleave", () => {
        if (tooltip) tooltip.style.opacity = "0";
        cursor.attr("opacity", 0);
        cursorDot.attr("opacity", 0);
      });

    const cursor = svg
      .append("line")
      .attr("y1", 0)
      .attr("y2", chartHeight)
      .attr("stroke", "#9ca3af")
      .attr("stroke-dasharray", "4 4")
      .attr("pointer-events", "none")
      .attr("opacity", 0);

    const cursorDot = svg
      .append("circle")
      .attr("r", 4)
      .attr("fill", color)
      .attr("stroke", "white")
      .attr("stroke-width", 2)
      .attr("pointer-events", "none")
      .attr("opacity", 0);
  }

  // Handle Resize
  function handleResize() {
    if (container) {
      width = container.clientWidth;
      draw();
    }
  }

  function updatePlayhead() {
    if (!playheadSelection || !xScale) return;
    if (currentTime !== null && currentTime >= 0) {
      const xPos = xScale(currentTime);
      playheadSelection.attr("x1", xPos).attr("x2", xPos).attr("opacity", 1);
    } else {
      playheadSelection.attr("opacity", 0);
    }
  }

  onMount(() => {
    handleResize();
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);
    return () => ro.disconnect();
  });
</script>

<div class="w-full relative">
  <div bind:this={container} class="w-full" style="height: {height}px;"></div>

  <div
    bind:this={tooltip}
    class="fixed z-[60] bg-black/80 text-white text-xs p-2 rounded pointer-events-none opacity-0 transition-opacity duration-100"
    style="transform: translate(-50%, -100%);"
  ></div>
</div>
