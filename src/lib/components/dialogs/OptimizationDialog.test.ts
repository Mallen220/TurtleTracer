// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import OptimizationDialog from "./OptimizationDialog.svelte";

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

// What the dialog last built the optimizer with.
const constructed = vi.hoisted(() => ({ args: [] as unknown[] }));

vi.mock("../../../utils/pathOptimizer", () => ({
  PathOptimizer: class MockPathOptimizer {
    optimize = mockOptimize;
    stop = vi.fn();
    constructor(...args: unknown[]) {
      constructed.args = args;
    }
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

describe("OptimizationDialog with sharp chained corners", () => {
  const point = (x: number, y: number) => ({
    x,
    y,
    heading: "constant" as const,
    degrees: 0,
  });
  const out = {
    id: "a",
    name: "Out",
    controlPoints: [],
    color: "",
    endPoint: point(80, 10),
    eventMarkers: [],
  };
  const back = {
    id: "b",
    name: "Back",
    controlPoints: [],
    color: "",
    endPoint: point(20, 10),
    eventMarkers: [],
  };
  const sequence = [
    { kind: "path" as const, lineId: "a" },
    { kind: "path" as const, lineId: "b", isChain: true },
  ];

  const open = (chained: boolean) => {
    mockOptimize.mockResolvedValueOnce({
      lines: [out, back],
      bestTime: 9.5,
    });
    const onApply = vi.fn();
    const view = render(OptimizationDialog, {
      isOpen: true,
      lines: [out, back],
      startPoint: point(10, 10),
      settings: { ...DEFAULT_SETTINGS },
      sequence: chained
        ? sequence
        : sequence.map((s) => ({ ...s, isChain: false })),
      onApply,
      onClose: vi.fn(),
      onPreviewChange: vi.fn(),
    });
    return { ...view, onApply };
  };

  it("notes the corner but still lets the path be applied", async () => {
    const { getByText, findByText, onApply } = open(true);
    await fireEvent.click(getByText("Start Optimization"));

    expect(await findByText(/Sharp chained corner:/)).toBeInTheDocument();
    await fireEvent.click(await findByText("Apply New Path"));
    expect(onApply).toHaveBeenCalled();
  });

  it("says nothing when the paths aren't chained", async () => {
    const { getByText, findByText, queryByText } = open(false);
    await fireEvent.click(getByText("Start Optimization"));

    await findByText("Apply New Path");
    expect(queryByText(/Sharp chained/)).toBeNull();
  });
});

describe("OptimizationDialog chain correction toggle", () => {
  const point = (x: number, y: number) => ({
    x,
    y,
    heading: "constant" as const,
    degrees: 0,
  });
  const line = (id: string, x: number, y: number) => ({
    id,
    name: id,
    controlPoints: [],
    color: "",
    endPoint: point(x, y),
    eventMarkers: [],
  });
  const lines = [line("a", 80, 10), line("b", 80, 90)];
  const open = (chained: boolean) =>
    render(OptimizationDialog, {
      isOpen: true,
      lines,
      startPoint: point(10, 10),
      settings: { ...DEFAULT_SETTINGS },
      sequence: [
        { kind: "path" as const, lineId: "a" },
        {
          kind: "path" as const,
          lineId: "b",
          ...(chained ? { isChain: true } : {}),
        },
      ],
      onApply: vi.fn(),
      onClose: vi.fn(),
      onPreviewChange: vi.fn(),
    });

  beforeEach(() => {
    constructed.args = [];
  });

  it("is offered when paths are chained, and on by default", () => {
    open(true);
    const box = screen.getByLabelText(
      /Include chain corner correction/,
    ) as HTMLInputElement;
    expect(box.checked).toBe(true);
  });

  it("isn't offered when nothing is chained", () => {
    open(false);
    expect(
      screen.queryByLabelText(/Include chain corner correction/),
    ).toBeNull();
  });

  it("optimizes with the correction by default", async () => {
    open(true);
    await fireEvent.click(screen.getByText("Start Optimization"));
    expect(constructed.args[5]).toEqual({ chainCorrection: true });
  });

  it("can optimize without it, just for that run", async () => {
    const { findByText } = open(true);
    await fireEvent.click(
      screen.getByLabelText(/Include chain corner correction/),
    );
    await fireEvent.click(screen.getByText("Start Optimization"));
    expect(constructed.args[5]).toEqual({ chainCorrection: false });
    expect(
      await findByText(/optimized as if the robot follows each chained path/),
    ).toBeInTheDocument();
  });

  it("doesn't change the saved settings", async () => {
    const settings = { ...DEFAULT_SETTINGS };
    const before = JSON.stringify(settings);
    render(OptimizationDialog, {
      isOpen: true,
      lines,
      startPoint: point(10, 10),
      settings,
      sequence: [
        { kind: "path" as const, lineId: "a" },
        { kind: "path" as const, lineId: "b", isChain: true },
      ],
      onApply: vi.fn(),
      onClose: vi.fn(),
      onPreviewChange: vi.fn(),
    });
    await fireEvent.click(
      screen.getByLabelText(/Include chain corner correction/),
    );
    expect(JSON.stringify(settings)).toBe(before);
    expect("chainCorrection" in DEFAULT_SETTINGS).toBe(false);
  });
});
