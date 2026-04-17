// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ContextMenu from "../lib/components/tools/ContextMenu.svelte";
import { tick } from "svelte";

describe("ContextMenu", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(globalThis, "innerHeight", {
      writable: true,
      configurable: true,
      value: 1000,
    });
  });

  it("updates items correctly", async () => {
    const { component, rerender } = render(ContextMenu, {
      x: 0,
      y: 0,
      items: [{ label: "Item 1" }],
    });
    expect(screen.getByText("Item 1")).toBeTruthy();
    await rerender({
      x: 0,
      y: 0,
      items: [{ label: "Item 1 Updated" }],
    });
    expect(screen.getByText("Item 1 Updated")).toBeTruthy();
  });

  it("updates position correctly when going off screen", async () => {
    const { component, rerender } = render(ContextMenu, {
      x: 900,
      y: 900,
      items: [{ label: "Item 1" }],
    });

    const menuNode = screen.getByRole("menu");
    menuNode.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 200,
          height: 200,
          top: 0,
          left: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => {},
        }) as any,
    );

    // Let effect run
    await tick();
    await tick();

    expect(menuNode.style.left).toBe("700px");
    expect(menuNode.style.top).toBe("700px");

    await rerender({
      x: 100,
      y: 100,
      items: [{ label: "Item 1 Updated" }],
    });

    await tick();
    await tick();

    expect(menuNode.style.left).toBe("100px");
    expect(menuNode.style.top).toBe("100px");
  });
});
