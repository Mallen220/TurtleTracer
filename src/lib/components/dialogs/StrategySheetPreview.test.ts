import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import StrategySheetPreview from "./StrategySheetPreview.svelte";
import TestWrapper from "../../../../tests/components/dialogs/TestWrapper.svelte";
import type { Point, Line, SequenceItem, Settings } from "../../../types";

// Mock the global stores used by StrategySheetPreview
vi.mock("../../../stores", () => ({
  currentFilePath: {
    subscribe: vi.fn((fn) => {
      fn("C:\\test\\my_project.turt");
      return () => {};
    }),
  },
}));

vi.mock("../../projectStore", () => ({
  extraDataStore: {
    subscribe: vi.fn((fn) => {
      fn({ strategyNotes: "Test strategy notes" });
      return () => {};
    }),
    set: vi.fn(),
  },
}));

const mockSet = vi.fn().mockReturnThis();
const mockFrom = vi.fn().mockReturnThis();
const mockSave = vi.fn();

// Mock the html2pdf library import since it tries to load dynamically
vi.mock("html2pdf.js", () => {
  return {
    default: () => ({
      set: mockSet,
      from: mockFrom,
      save: mockSave,
    }),
  };
});

describe("StrategySheetPreview Component", () => {
  const mockStartPoint: Point = { x: 10, y: 20, heading: 0 };
  const mockLines: Line[] = [
    {
      id: "line1",
      name: "Test Path 1",
      type: "bezier",
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      endPoint: { x: 30, y: 40, heading: 90 },
      eventMarkers: [{ name: "Drop Marker", position: 0.5, t: 0.5 }],
    },
  ];
  const mockSequence: SequenceItem[] = [
    { kind: "path", lineId: "line1" },
    { kind: "wait", id: "w1", name: "Short Wait", durationMs: 1500 },
    { kind: "rotate", id: "r1", name: "Turn Right", degrees: 45 },
  ];
  const mockSettings: Settings = {
    rWidth: 16,
    rLength: 18,
    maxVelocity: 50,
    maxAcceleration: 40,
    fieldMap: "decode.webp",
  } as any;
  const mockTimePrediction = {
    totalTime: 5.5, // 5.5 seconds
    totalDistance: 45,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    const { queryByRole } = render(StrategySheetPreview, {
      isOpen: false,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });
    expect(queryByRole("dialog")).toBeNull();
  });

  it("renders when isOpen is true and shows project name", () => {
    render(StrategySheetPreview, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    // Check for the project name derived from currentFilePath
    expect(
      screen.getByText("my_project", { exact: false }),
    ).toBeInTheDocument();
  });

  it("maps sequence data to the path sequence table correctly", () => {
    render(StrategySheetPreview, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    // Start node is rendered explicitly with 0 index
    expect(screen.getByText("Start")).toBeInTheDocument();

    // Path 1 mapping
    expect(screen.getByText("Test Path 1")).toBeInTheDocument();
    expect(screen.getByText(/-> \(30.0, 40.0\)/)).toBeInTheDocument();
    expect(screen.getByText("Drop Marker @ 50%")).toBeInTheDocument();

    // Wait mapping
    expect(screen.getByText("Short Wait")).toBeInTheDocument();
    expect(screen.getByText("1500ms")).toBeInTheDocument();

    // Rotate mapping
    expect(screen.getByText("Turn Right")).toBeInTheDocument();
    expect(screen.getByText("45°")).toBeInTheDocument();
  });

  it("displays robot profile and statistics from settings correctly", () => {
    render(StrategySheetPreview, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    // Robot Profile
    expect(screen.getByText('16"')).toBeInTheDocument();
    expect(screen.getByText('18"')).toBeInTheDocument();
    expect(screen.getByText("50 in/s")).toBeInTheDocument();
    expect(screen.getByText("40 in/s²")).toBeInTheDocument();

    // Statistics
    expect(screen.getAllByText("5.500s").length).toBeGreaterThan(0); // Displayed twice (header and stats block)
    // Distance format output depends on user format settings, but checking for presence of distance logic
    expect(screen.getByText(/45.0\s*in/)).toBeInTheDocument();
    expect(
      screen.getByText("1", { selector: ".grid > .font-medium" }),
    ).toBeInTheDocument(); // 1 line segment
  });

  it("renders the strategy notes from store", () => {
    render(StrategySheetPreview, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    const textarea = screen.getByPlaceholderText(
      "Type your strategy notes here...",
    ) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Test strategy notes");
  });

  it("triggers PDF download when Download PDF button is clicked", async () => {
    const { getByText } = render(StrategySheetPreview, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    const downloadBtn = getByText("Download PDF");
    await fireEvent.click(downloadBtn);

    // Dynamic import takes a moment
    await waitFor(() => {
      // The mock html2pdf logic verifies that we triggered the module function
      // Since it's dynamically imported, the full trace involves a promise resolution
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: "my_project-strategy-sheet.pdf",
        }),
      );
      expect(mockFrom).toHaveBeenCalled();
      expect(mockSave).toHaveBeenCalled();
    });
  });

  it("closes the dialog when the close button is clicked", async () => {
    // Svelte 5 prop binding test pattern using wrapper component
    const { component, container } = render(TestWrapper, {
      isOpen: true,
      startPoint: mockStartPoint,
      lines: mockLines,
      sequence: mockSequence,
      settings: mockSettings,
      timePrediction: mockTimePrediction,
    });

    const closeButton = container.querySelector("button:last-child");
    await fireEvent.click(closeButton!);

    // the wrapper exposes getIsOpen() method
    expect(component.getIsOpen()).toBe(false);
  });
});
