// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { render, screen } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import FieldCoordinates from "../lib/components/FieldCoordinates.svelte";

describe("FieldCoordinates", () => {
  it("renders coordinates correctly", () => {
    render(FieldCoordinates, { props: { x: 10.5, y: 20.3, visible: true } });
    // Look for the formatted text
    expect(screen.getByText('10.5"')).toBeInTheDocument();
    expect(screen.getByText('20.3"')).toBeInTheDocument();
  });

  it("does not render when not visible", () => {
    render(FieldCoordinates, { props: { x: 0, y: 0, visible: false } });
    expect(screen.queryByText("X:")).not.toBeInTheDocument();
  });

  it("changes position when obstructed", async () => {
    const { component } = render(FieldCoordinates, {
      props: { x: 0, y: 0, visible: true, isObstructed: false },
    });
    let container = screen.getByRole("status");

    // Check initial position (bottom-left)
    expect(container.className).toContain("bottom-2");
    expect(container.className).toContain("left-2");

    // Update prop
    await component.$set({ isObstructed: true });
    container = screen.getByRole("status");

    // Check new position (top-right)
    expect(container.className).toContain("top-2");
    expect(container.className).toContain("right-2");
  });
});
