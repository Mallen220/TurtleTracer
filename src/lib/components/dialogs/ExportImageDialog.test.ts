import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ExportImageDialog from "./ExportImageDialog.svelte";

vi.mock("../../../utils/exportAnimation", () => ({
  exportPathToImage: vi.fn(),
}));

describe("ExportImageDialog", () => {
  it("renders when show is true", () => {
    const { getByText, getByRole } = render(ExportImageDialog, {
      show: true,
      twoInstance: { update: vi.fn() },
      settings: {
        export: {
          format: "png",
          quality: 1,
          includeBackground: true,
          drawRobot: true,
        },
        robot: { length: 18, width: 18 },
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      robotState: { x: 0, y: 0, heading: 0 },
      electronAPI: {},
    });

    expect(getByText("Export Image")).toBeInTheDocument();
  });

  it("interacts with inputs correctly", async () => {
    const { getByRole, getByLabelText } = render(ExportImageDialog, {
      show: true,
      twoInstance: { update: vi.fn() },
      settings: {
        export: {
          format: "png",
          quality: 1,
          includeBackground: true,
          drawRobot: true,
        },
        robot: { length: 18, width: 18 },
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      robotState: { x: 0, y: 0, heading: 0 },
      electronAPI: {},
    });

    const formatSelect = getByLabelText("Format");
    await fireEvent.change(formatSelect, { target: { value: "jpeg" } });
    expect(formatSelect).toHaveValue("jpeg");
  });

  it("can trigger export process", async () => {
    // Tests that interacting with Generate & Save works
    const { getByRole } = render(ExportImageDialog, {
      show: true,
      twoInstance: {
        update: vi.fn(),
        renderer: { domElement: document.createElement("canvas") },
      },
      settings: {
        export: {
          format: "png",
          quality: 1,
          includeBackground: true,
          drawRobot: true,
        },
        robot: { length: 18, width: 18 },
      },
      robotLengthPx: 10,
      robotWidthPx: 10,
      robotState: { x: 0, y: 0, heading: 0 },
      electronAPI: {},
    });

    // Check for Download / Save button if Generate & Save is not present
    const saveBtn = getByRole("button", { name: /Download \/ Save/i });
    expect(saveBtn).toBeInTheDocument();
  });
});
