// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import type Two from "two.js";
import ExportGifDialog from "./ExportGifDialog.svelte";
import { createAnimationController } from "../../../utils/animation";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("../../../utils/exportAnimation", () => ({
  exportPathToGif: vi.fn(),
}));

const props = () => ({
  show: true,
  twoInstance: {
    update: vi.fn(),
    renderer: { domElement: document.createElement("canvas") },
  } as unknown as Two,
  settings: DEFAULT_SETTINGS,
  robotLengthPx: 10,
  robotWidthPx: 10,
  animationController: createAnimationController(5, vi.fn()),
  robotStateFunction: vi.fn(),
});

describe("ExportGifDialog", () => {
  it("renders when show is true", () => {
    const { getByText } = render(ExportGifDialog, props());
    expect(getByText("Export Animation")).toBeInTheDocument();
  });

  it("interacts with format select correctly", async () => {
    const { getByLabelText } = render(ExportGifDialog, props());
    const formatSelect = getByLabelText("Format");
    await fireEvent.change(formatSelect, { target: { value: "apng" } });
    expect(formatSelect).toHaveValue("apng");
  });

  it("can interact with action buttons", () => {
    const { getByRole } = render(ExportGifDialog, props());
    expect(
      getByRole("button", { name: /Generate & Save/i }),
    ).toBeInTheDocument();
    expect(
      getByRole("button", { name: /Generate Preview/i }),
    ).toBeInTheDocument();
  });
});
