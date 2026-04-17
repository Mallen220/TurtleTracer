import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import PathStatisticsDialog from "./PathStatisticsDialog.svelte";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("../../../stores", () => ({
  notification: { show: vi.fn() },
}));

describe("PathStatisticsDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(PathStatisticsDialog, {
      isOpen: true,
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      lines: [],
      sequence: [],
      settings: DEFAULT_SETTINGS,
      onClose: vi.fn(),
    });

    expect(getByText("Path Statistics")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    const { getByRole } = render(PathStatisticsDialog, {
      isOpen: true,
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      lines: [],
      sequence: [],
      settings: DEFAULT_SETTINGS,
      onClose,
    });

    const closeBtn = getByRole("button", { name: "Close" });
    await fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
