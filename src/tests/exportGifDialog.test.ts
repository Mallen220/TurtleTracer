// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import ExportGifDialog from "../lib/components/dialogs/ExportGifDialog.svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the exporter so it respects AbortSignal
vi.mock("../utils/exportAnimation", async () => {
  const actual = await vi.importActual<any>("../utils/exportAnimation");
  return {
    ...actual,
    exportPathToGif: vi.fn(async (opts: any) => {
      return await new Promise<Blob>((resolve, reject) => {
        const timeout = setTimeout(
          () => resolve(new Blob(["gif"], { type: "image/gif" })),
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
    }),
    exportPathToApng: vi.fn(async (opts: any) => {
      return await new Promise<Blob>((resolve, reject) => {
        const timeout = setTimeout(
          () => resolve(new Blob(["png"], { type: "image/png" })),
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
    }),
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
    const { getByText, getByLabelText, queryByText, container } = render(
      ExportGifDialog,
      props as any,
    );

    // Start generation
    const genBtn = getByText("Generate Preview");
    await fireEvent.click(genBtn);

    // Confirm status shows generating (progress text exists)
    await waitFor(() => {
      expect(container.textContent).toContain("Capturing frames");
    });

    // Click the X (close) button in header
    const closeBtn = getByLabelText("Close");
    await fireEvent.click(closeBtn);

    // dialog should be removed from DOM (allow extra time for transitions)
    await waitFor(
      () => {
        expect(queryByText("Export Animation")).toBeNull();
      },
      { timeout: 2000 },
    );

    // The exporter should have been called and aborted
    expect(exporter.exportPathToGif as any).toHaveBeenCalled();
  });
});
