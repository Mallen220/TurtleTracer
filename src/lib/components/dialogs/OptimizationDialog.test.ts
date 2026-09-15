// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import OptimizationDialog from "./OptimizationDialog.svelte";
import type { Line } from "../../../types";

import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("$lib/components/icons/ChevronRightSolidIcon.svelte", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("$lib/components/icons/SpinnerIcon.svelte", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("$lib/components/icons/PlayIcon.svelte", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("$lib/components/icons/LockIcon.svelte", () => ({
  default: vi.fn(() => ({})),
}));
vi.mock("$lib/components/SectionHeader.svelte", () => ({
  default: vi.fn(() => ({})),
}));

const mockOptimize = vi.fn(async (callback: any) => {
  if (callback) {
    callback({
      generation: 1,
      bestTime: 2.5,
      bestLines: [
        {
          id: "l1",
          name: "Path 1",
          controlPoints: [{ x: 10, y: 10 }],
          color: "",
          endPoint: { x: 20, y: 20, heading: "constant", degrees: 0 },
          eventMarkers: [],
        },
      ],
    });
  }
  return {
    lines: [
      {
        id: "l1",
        name: "Path 1",
        controlPoints: [{ x: 10, y: 10 }],
        color: "",
        endPoint: { x: 20, y: 20, heading: "constant", degrees: 0 },
        eventMarkers: [],
      },
    ],
    bestTime: 2.5,
  };
});

vi.mock("../../../utils/pathOptimizer", () => ({
  PathOptimizer: class MockPathOptimizer {
    optimize = mockOptimize;
    stop = vi.fn();
  },
}));

describe("OptimizationDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(OptimizationDialog, {
      isOpen: true,
      lines: [
        {
          id: "l1",
          name: "Path 1",
          controlPoints: [],
          color: "",
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          eventMarkers: [],
        },
      ],
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      sequence: [],
      onApply: vi.fn(),
      onClose: vi.fn(),
      onPreviewChange: vi.fn(),
    });

    expect(getByText("Start Optimization")).toBeInTheDocument();
  });

  it("can select and deselect lines", async () => {
    const { getByRole, getByText } = render(OptimizationDialog, {
      isOpen: true,
      lines: [
        {
          id: "l1",
          name: "Path 1",
          controlPoints: [],
          color: "",
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          eventMarkers: [],
        },
        {
          id: "l2",
          name: "Path 2",
          controlPoints: [],
          color: "",
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          eventMarkers: [],
        },
      ],
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      sequence: [],
      onApply: vi.fn(),
      onClose: vi.fn(),
      onPreviewChange: vi.fn(),
    });

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();

    await fireEvent.click(getByText("None"));
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();

    await fireEvent.click(getByText("All"));
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("emits live preview on every optimization run, not just the first time", async () => {
    const onPreviewChange = vi.fn();
    const onApply = vi.fn();
    const mockSettings = { ...DEFAULT_SETTINGS };

    const { getByText, findByText } = render(OptimizationDialog, {
      isOpen: true,
      lines: [
        {
          id: "l1",
          name: "Path 1",
          controlPoints: [],
          color: "",
          endPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
          eventMarkers: [],
        },
      ],
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      settings: mockSettings,
      sequence: [],
      onApply,
      onClose: vi.fn(),
      onPreviewChange,
    });

    // Run 1: Click "Start Optimization"
    await fireEvent.click(getByText("Start Optimization"));

    // onPreviewChange should have been called during generation update AND at completion
    expect(onPreviewChange).toHaveBeenCalled();
    const callCountAfterRun1 = onPreviewChange.mock.calls.length;
    expect(callCountAfterRun1).toBeGreaterThanOrEqual(2); // At least 1 intermediate + 1 final

    // Apply the path
    const applyButton = await findByText("Apply New Path");
    await fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalled();
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);

    // Reopen the section since handleApply sets isOpen = false
    const expandButton = await findByText("Path Optimization");
    await fireEvent.click(expandButton);

    // Run 2: Start optimization a second time
    onPreviewChange.mockClear();
    await fireEvent.click(await findByText("Start Optimization"));

    // Crucial check: onPreviewChange MUST be called during generation update on the 2nd run
    expect(onPreviewChange).toHaveBeenCalled();
    expect(onPreviewChange.mock.calls[0][0]).not.toBeNull();
    expect(onPreviewChange.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
