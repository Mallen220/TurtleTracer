import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import OptimizationDialog from "./OptimizationDialog.svelte";
import type { Line } from "../../../types";

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
vi.mock("../../../utils/optimization/GeneticOptimizer", () => ({
  GeneticOptimizer: class MockOptimizer {
    constructor() {}
    start(lines: Line[]) {
      return { time: 5, path: [] };
    }
    stop() {}
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
});
