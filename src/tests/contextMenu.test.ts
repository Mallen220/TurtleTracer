// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ContextMenu from "../lib/components/tools/ContextMenu.svelte";
import { tick } from "svelte";
import { setupUIViewport } from "./testUtils";

describe("ContextMenu", () => {
  beforeEach(() => {
    setupUIViewport();
  });

  it("updates items correctly", async () => {
    const { rerender } = render(ContextMenu as any, {
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
    const { testMenuOffScreenPositioning } = await import("./testUtils");
    await testMenuOffScreenPositioning(
      { x: 900, y: 900, items: [{ label: "Item 1" }] },
      { x: 100, y: 100, items: [{ label: "Item 1 Updated" }] },
      tick,
      screen,
      expect,
      (props: any) => render(ContextMenu as any, props),
    );
  });

  it("shows a plugin's SVG string icon", () => {
    render(ContextMenu, {
      x: 0,
      y: 0,
      items: [
        {
          label: "From plugin",
          icon: '<svg data-testid="plugin-icon"><circle r="1" /></svg>',
        },
      ],
    });
    expect(screen.getByText("From plugin")).toBeTruthy();
    expect(screen.getByTestId("plugin-icon")).toBeTruthy();
  });
});
