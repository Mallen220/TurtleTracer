// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { tooltipPortal } from "./portal";

describe("tooltipPortal", () => {
  it("moves the tooltip to the body, and removes it without a trace", () => {
    const anchor = document.createElement("span");
    const tip = document.createElement("div");
    anchor.appendChild(tip);
    document.body.appendChild(anchor);

    const action = tooltipPortal(tip, anchor);
    expect(tip.parentNode).toBe(document.body);

    action.destroy();
    expect(tip.isConnected).toBe(false);
    expect(anchor.childNodes).toHaveLength(0);
    anchor.remove();
  });

  it("copes with the tooltip being removed first, as Svelte does", () => {
    const anchor = document.createElement("span");
    const tip = document.createElement("div");
    anchor.appendChild(tip);
    document.body.appendChild(anchor);

    const action = tooltipPortal(tip, anchor);
    tip.remove();
    action.destroy();

    expect(tip.isConnected).toBe(false);
    expect(anchor.childNodes).toHaveLength(0);
    anchor.remove();
  });
});
