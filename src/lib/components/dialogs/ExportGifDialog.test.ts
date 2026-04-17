import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ExportGifDialog from "./ExportGifDialog.svelte";

vi.mock("../../../utils/exportAnimation", () => ({
  exportPathToGif: vi.fn(),
}));

describe("ExportGifDialog", () => {
  it("renders when show is true", () => {
    const { getByText } = render(ExportGifDialog, {
      show: true,
      twoInstance: { update: vi.fn() },
      settings: {
        export: { format: "png", quality: 1, includeBackground: true, drawRobot: true },
        robot: { length: 18, width: 18 }
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      electronAPI: {},
      animationController: { time: 0, setTime: vi.fn() },
      robotStateFunction: vi.fn()
    });

    expect(getByText("Export Animation")).toBeInTheDocument();
  });

  it("interacts with format select correctly", async () => {
    const { getByLabelText } = render(ExportGifDialog, {
      show: true,
      twoInstance: { update: vi.fn() },
      settings: {
        export: { format: "png", quality: 1, includeBackground: true, drawRobot: true },
        robot: { length: 18, width: 18 }
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      electronAPI: {},
      animationController: { time: 0, setTime: vi.fn() },
      robotStateFunction: vi.fn()
    });

    const formatSelect = getByLabelText("Format");
    await fireEvent.change(formatSelect, { target: { value: "apng" } });
    expect(formatSelect).toHaveValue("apng");
  });

  it("can interact with action buttons", async () => {
    const { getByRole } = render(ExportGifDialog, {
      show: true,
      twoInstance: { update: vi.fn(), renderer: { domElement: document.createElement("canvas") } },
      settings: {
        export: { format: "png", quality: 1, includeBackground: true, drawRobot: true },
        robot: { length: 18, width: 18 }
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      electronAPI: {},
      animationController: { time: 0, setTime: vi.fn() },
      robotStateFunction: vi.fn()
    });

    const saveBtn = getByRole("button", { name: /Generate & Save/i });
    expect(saveBtn).toBeInTheDocument();
    const previewBtn = getByRole("button", { name: /Generate Preview/i });
    expect(previewBtn).toBeInTheDocument();
  });
});
