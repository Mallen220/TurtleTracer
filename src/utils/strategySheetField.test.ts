// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { decorateField } from "./strategySheetField";

const field = () => {
  const el = document.createElement("div");
  el.innerHTML = `<svg><g>
    <path id="shape-0" stroke="#00f" fill="#00f" />
    <path id="line-1" stroke="#f00" fill="none" />
    <path id="point-1-0" fill="#0f0" stroke="none" transform="matrix(1 0 0 1 30 40)" />
  </g></svg>`;
  return el.firstElementChild as SVGElement;
};

describe("decorateField", () => {
  it("numbers the end point where Two.js put it", () => {
    const svg = field();
    decorateField(svg, svg, [{ id: "point-1-0", n: 3 }], false);
    const disc = svg.querySelector("g > g")!;
    expect(disc.getAttribute("transform")).toBe("translate(30 40)");
    expect(disc.querySelector("text")!.textContent).toBe("3");
  });

  it("skips a point that isn't drawn", () => {
    const svg = field();
    decorateField(svg, svg, [{ id: "point-9-0", n: 1 }], false);
    expect(svg.querySelector("text")).toBeNull();
  });

  it("ink saver draws paths and points black", () => {
    const svg = field();
    decorateField(svg, svg, [], true);
    expect(svg.querySelector("#shape-0")).toBeNull();
    expect(svg.querySelector("#line-1")!.getAttribute("stroke")).toBe("#000");
    expect(svg.querySelector("#point-1-0")!.getAttribute("fill")).toBe("#000");
    expect(svg.querySelector("#point-1-0")!.getAttribute("stroke")).toBe(
      "none",
    );
  });
});
