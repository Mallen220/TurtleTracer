// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import ExportGifDialogWrapper from "./ExportGifDialogWrapper.svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the exporter
vi.mock("../utils/exportAnimation", async () => {
  const actual = await vi.importActual<any>("../utils/exportAnimation");
  return {
    ...actual,
    exportPathToGif: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Blob(["gif"], { type: "image/gif" });
    }),
    exportPathToApng: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return new Blob(["png"], { type: "image/png" });
    }),
  };
});

import * as exporter from "../utils/exportAnimation";

describe("ExportGifDialog", () => {
  let props: any;

  beforeEach(() => {
    props = {
      twoInstance: {},
      animationController: {
        getDuration: () => 0.5,
        pause: () => {},
        play: () => {},
        isPlaying: () => true,
        seekToPercent: () => {},
      },
      settings: {},
      robotLengthPx: 40,
      robotWidthPx: 20,
      robotStateFunction: () => ({ x: 10, y: 10, heading: 0 }),
      electronAPI: null,
      show: true,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Generates preview and can be cancelled", async () => {
    render(ExportGifDialogWrapper, {
      props: { props },
    });

    // Start generation
    const genBtn = screen.getByText("Generate Preview");
    await fireEvent.click(genBtn);

    // Wait for "Capturing frames" to appear
    const statusMsg = await screen.findByText(
      /Capturing frames/i,
      {},
      { timeout: 2000 },
    );
    expect(statusMsg).toBeInTheDocument();

    // The exporter should have been called
    await waitFor(() => {
      expect(exporter.exportPathToGif).toHaveBeenCalled();
    });

    // Click the Cancel button
    const cancelBtn = screen.getByText("Cancel");
    await fireEvent.click(cancelBtn);

    // Wait for the wrapper's indicator that show is false
    await screen.findByTestId("dialog-closed-indicator", {}, { timeout: 3000 });

    // Header should be gone
    expect(screen.queryByText("Export Animation")).toBeNull();
  });
});
