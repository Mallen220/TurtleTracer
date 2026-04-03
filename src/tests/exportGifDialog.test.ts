// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import ExportGifDialog from "../lib/components/dialogs/ExportGifDialog.svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the exporter so it respects AbortSignal
vi.mock("../utils/exportAnimation", async () => {
  const actual = await vi.importActual<any>("../utils/exportAnimation");

  const createMockExporter = (type: string, content: string) => {
    return vi.fn(async (opts: any) => {
      return await new Promise<Blob>((resolve, reject) => {
        const timeout = setTimeout(
          () => resolve(new Blob([content], { type })),
          50,
        );
        const onAbort = () => {
          clearTimeout(timeout);
          const e = new Error("Aborted");
          (e as any).name = "AbortError";
          reject(e);
        };
        opts.signal?.addEventListener("abort", onAbort);
      });
    });
  }

  return {
    ...actual,
    exportPathToGif: createMockExporter("image/gif", "gif"),
    exportPathToApng: createMockExporter("image/png", "png"),
  };
});

import * as exporter from "../utils/exportAnimation";

describe("ExportGifDialog", () => {
  let props: any;

  beforeEach(() => {
    props = {
      show: true,
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
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("X button aborts generation and closes dialog", async () => {
    const mockConsoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { getByText, getByLabelText, component } = render(ExportGifDialog, props as any);
    const closeHandler = vi.fn();
    component.$on("close", closeHandler);

    // Start generation
    const genBtn = getByText("Generate Preview");
    await fireEvent.click(genBtn);

    // Confirm generation started before aborting the dialog.
    await waitFor(() => {
      expect(exporter.exportPathToGif as any).toHaveBeenCalled();
    });

    // Click the X (close) button in header
    const closeBtn = getByLabelText("Close");
    await fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(closeHandler).toHaveBeenCalled();
    });

    // The exporter should have been called and aborted
    expect(exporter.exportPathToGif as any).toHaveBeenCalled();

    mockConsoleError.mockRestore();
  });
});
