// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import TransformDialog from "./TransformDialog.svelte";

vi.mock("../../../stores", () => ({
  isUnsaved: { set: vi.fn() },
  notification: { show: vi.fn() },
}));

vi.mock("../../../lib/projectStore", () => ({
  startPointStore: { get: vi.fn(), set: vi.fn(), subscribe: vi.fn() },
  linesStore: { get: vi.fn(), set: vi.fn(), subscribe: vi.fn() },
  shapesStore: { get: vi.fn(), set: vi.fn(), subscribe: vi.fn() },
  sequenceStore: { get: vi.fn(), set: vi.fn(), subscribe: vi.fn() },
}));

vi.mock("../../../utils/pathTransform", () => ({
  translatePathData: vi.fn(),
  rotatePathData: vi.fn(),
  flipPathData: vi.fn(),
  reversePathData: vi.fn(),
}));

describe("TransformDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(TransformDialog, {
      isOpen: true,
    });

    expect(getByText("Transform Path")).toBeInTheDocument();
  });

  it("can switch tabs", async () => {
    const { getByRole, getByText } = render(TransformDialog, {
      isOpen: true,
    });

    const rotateTab = getByRole("button", { name: "Rotate" });
    await fireEvent.click(rotateTab);
    expect(getByText(/Angle \(Degrees, Clockwise\)/i)).toBeInTheDocument();

    const flipTab = getByRole("button", { name: "Flip" });
    await fireEvent.click(flipTab);
    expect(getByText(/Flip Horizontal \(X\)/i)).toBeInTheDocument();
  });

  it("contains apply button", async () => {
    const { getByRole } = render(TransformDialog, {
      isOpen: true,
    });

    const applyBtn = getByRole("button", { name: "Apply" });
    expect(applyBtn).toBeInTheDocument();
  });
});
