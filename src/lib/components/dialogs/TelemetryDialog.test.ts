// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import TelemetryDialog from "./TelemetryDialog.svelte";

vi.mock("../../telemetryStore", () => ({
  importedTelemetryData: {
    set: vi.fn(),
    subscribe: vi.fn((fn) => {
      fn(null);
      return () => {};
    }),
  },
  showTelemetry: {
    set: vi.fn(),
    subscribe: vi.fn((fn) => {
      fn(false);
      return () => {};
    }),
  },
  showTelemetryGhost: {
    set: vi.fn(),
    subscribe: vi.fn((fn) => {
      fn(false);
      return () => {};
    }),
  },
  telemetryOffset: {
    set: vi.fn(),
    subscribe: vi.fn((fn) => {
      fn(0);
      return () => {};
    }),
  },
}));

describe("TelemetryDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByRole } = render(TelemetryDialog, {
      isOpen: true,
    });

    // We can use presentation to find the dialog. Svelte transition doesn't apply standard dialog properly initially or something.
    expect(getByRole("presentation")).toBeInTheDocument();
  });
});
