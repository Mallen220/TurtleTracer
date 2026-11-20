// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Touches up a clone of the live field SVG for the strategy sheet. `numbers`
 * puts a numbered disc on the end point with each id (`point-<line>-0`);
 * `inkSaver` draws paths and points in black and leaves out obstacles. `live` is the field the clone
 * came from, which gives the discs their size.
 */
export function decorateField(
  svg: Element,
  live: Element,
  numbers: { id: string; n: number }[],
  inkSaver: boolean,
) {
  // Sized to the field, so a disc reads the same on any field map.
  const fieldWidth = Number.parseFloat(live.getAttribute("width") ?? "") || 600;
  if (inkSaver) {
    // Obstacles and keep-in zones are filled shapes: ink hogs.
    for (const el of svg.querySelectorAll('[id^="shape-"]')) el.remove();
    for (const el of svg.querySelectorAll('[stroke]:not([stroke="none"])'))
      el.setAttribute("stroke", "#000");
    for (const el of svg.querySelectorAll('path[id^="point-"]'))
      el.setAttribute("fill", "#000");
  }
  for (const { id, n } of numbers) {
    const point = svg.querySelector(`[id="${id}"]`);
    // Two.js places a point with a matrix: a b c d x y.
    const matrix = /matrix\(([^)]+)\)/.exec(
      point?.getAttribute("transform") ?? "",
    );
    if (!point?.parentNode || !matrix) continue;
    const [, , , , x, y] = matrix[1].split(/[\s,]+/).map(Number);
    const r = fieldWidth * 0.02;

    const disc = document.createElementNS(SVG_NS, "g");
    disc.setAttribute("transform", `translate(${x} ${y})`);
    const circle = document.createElementNS(SVG_NS, "circle");
    circle.setAttribute("r", String(r * 1.2));
    circle.setAttribute("fill", "#fff");
    circle.setAttribute("stroke", "#000");
    circle.setAttribute("stroke-width", String(r * 0.15));
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "central");
    text.setAttribute("font-size", String(r * 1.4));
    text.setAttribute("font-weight", "700");
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("fill", "#000");
    text.textContent = String(n);
    disc.append(circle, text);
    point.parentNode.appendChild(disc);
  }
}
