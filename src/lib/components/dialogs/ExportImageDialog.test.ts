// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import type Two from "two.js";
import ExportImageDialog from "./ExportImageDialog.svelte";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("../../../utils/exportAnimation", () => ({
  exportPathToImage: vi.fn(),
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
  robotState: { x: 0, y: 0, heading: 0 },
});

describe("ExportImageDialog", () => {
  it("renders when show is true", () => {
    const { getByText } = render(ExportImageDialog, props());
    expect(getByText("Export Image")).toBeInTheDocument();
  });

  it("interacts with inputs correctly", async () => {
    const { getByLabelText } = render(ExportImageDialog, props());
    const formatSelect = getByLabelText("Format");
    await fireEvent.change(formatSelect, { target: { value: "jpeg" } });
    expect(formatSelect).toHaveValue("jpeg");
  });

  it("offers to download or save", () => {
    const { getByRole } = render(ExportImageDialog, props());
    expect(
      getByRole("button", { name: /Download \/ Save/i }),
    ).toBeInTheDocument();
  });
});
