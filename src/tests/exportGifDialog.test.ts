// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import ExportGifDialogWrapper from "./ExportGifDialogWrapper.svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock the exporter
vi.mock("../utils/exportAnimation", async () => {
  const actual = await vi.importActual<any>("../utils/exportAnimation");
  return {
    ...actual,
    estimateGifSize: vi.fn(async () => 2 * 1024 * 1024),
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
      twoInstance: {
        renderer: {
          domElement: {
            getBoundingClientRect: () => ({ width: 800, height: 600 }),
          },
        },
      },
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

  it("shows real pixel sizes and a summary", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    // 800 × 600 view: 720 wide gives 540 high
    expect(
      await screen.findByRole("option", { name: "720 × 540" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("export-summary").textContent).toMatch(
      /720 × 540 px · 15 fps · 0\.5 s ·\s+8 frames/,
    );
  });

  it("only offers 60 fps for APNG", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    await screen.findByLabelText("Frame Rate");
    expect(screen.queryByRole("option", { name: "60 FPS" })).toBeNull();
    await fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "apng" },
    });
    expect(screen.getByRole("option", { name: "60 FPS" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "120 FPS" })).toBeNull();
    expect(screen.getByText(/Reduce to 256 colors/)).toBeInTheDocument();
  });

  it("falls back to 50 fps when switching to GIF from 60", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    const format = await screen.findByLabelText("Format");
    await fireEvent.change(format, { target: { value: "apng" } });
    await fireEvent.change(screen.getByLabelText("Frame Rate"), {
      target: { value: "60" },
    });
    await fireEvent.change(format, { target: { value: "gif" } });
    expect(screen.getByLabelText("Frame Rate")).toHaveValue("50");
  });

  it("doesn't warn about memory for a GIF, which is encoded as it goes", async () => {
    props.animationController.getDuration = () => 60;
    render(ExportGifDialogWrapper, { props: { props } });
    await fireEvent.change(await screen.findByLabelText("Size"), {
      target: { value: "2160" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns about a big APNG export but still lets it run", async () => {
    props.animationController.getDuration = () => 60;
    render(ExportGifDialogWrapper, { props: { props } });
    await screen.findByLabelText("Size");
    await fireEvent.change(screen.getByLabelText("Format"), {
      target: { value: "apng" },
    });
    await fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: "2160" },
    });
    // 2160 × 1620 × 4 × 900 frames is about 11.7 GB
    expect(await screen.findByRole("alert")).toHaveTextContent(/may be slow/);
    expect(screen.getByText("Generate Preview")).toBeEnabled();
    expect(screen.getByText("Generate & Save")).toBeEnabled();
  });

  it("exports at a custom width", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    await fireEvent.change(await screen.findByLabelText("Size"), {
      target: { value: "custom" },
    });
    const input = screen.getByLabelText("Custom width in pixels");
    await fireEvent.input(input, { target: { value: "500" } });
    await fireEvent.blur(input);
    expect(screen.getByTestId("custom-size")).toHaveTextContent("× 375 px");
    await fireEvent.click(screen.getByText("Generate Preview"));
    await waitFor(() =>
      expect(exporter.exportPathToGif).toHaveBeenLastCalledWith(
        expect.objectContaining({ width: 500 }),
      ),
    );
  });

  it("shows an estimated size", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    await screen.findByLabelText("Size");
    expect(
      await screen.findByText(
        /Estimated file size: ~2\.0 MB/,
        {},
        { timeout: 2000 },
      ),
    ).toBeInTheDocument();
  });

  it("estimates again when the size or frame rate changes", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    await screen.findByText(/Estimated file size/, {}, { timeout: 2000 });
    const calls = () => vi.mocked(exporter.estimateGifSize).mock.calls.length;
    const before = calls();
    await fireEvent.change(screen.getByLabelText("Size"), {
      target: { value: "1080" },
    });
    await waitFor(() => expect(calls()).toBe(before + 1), { timeout: 2000 });
    await fireEvent.change(screen.getByLabelText("Frame Rate"), {
      target: { value: "30" },
    });
    await waitFor(() => expect(calls()).toBe(before + 2), { timeout: 2000 });
  });

  it("gives no estimate for an APNG, and says where to find the size", async () => {
    render(ExportGifDialogWrapper, { props: { props } });
    await fireEvent.change(await screen.findByLabelText("Format"), {
      target: { value: "apng" },
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(screen.queryByText(/Estimated file size/)).toBeNull();
    expect(screen.getByTestId("export-size")).toHaveTextContent(
      /Exact file size is shown once the preview is made/,
    );
  });

  it("explains an out-of-memory failure in plain words", async () => {
    vi.mocked(exporter.exportPathToGif).mockRejectedValueOnce(
      new RangeError("Out of memory at ImageData creation"),
    );
    render(ExportGifDialogWrapper, { props: { props } });
    await fireEvent.click(await screen.findByText("Generate Preview"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /Not enough memory for this size \(Out of memory at ImageData creation\)/,
    );
  });

  it("names what it is doing, with the same percentage as the bar", async () => {
    vi.mocked(exporter.exportPathToApng).mockImplementationOnce(
      async (options) => {
        options.onProgress?.(0.4, "Encoding APNG");
        await new Promise((r) => setTimeout(r, 300));
        return new Blob(["png"], { type: "image/png" });
      },
    );
    render(ExportGifDialogWrapper, { props: { props } });
    await fireEvent.change(await screen.findByLabelText("Format"), {
      target: { value: "apng" },
    });
    await fireEvent.click(screen.getByText("Generate Preview"));
    expect(await screen.findByText("Encoding APNG... 40%")).toBeInTheDocument();
  });
});
