// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { tabRegistry } from "../lib/registries";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { get } from "svelte/store";
import { registerDefaultControlTabs } from "../lib/ControlTab.svelte";

describe("Telemetry tab visibility setting", () => {
  beforeEach(() => {
    // clear any previously registered tabs
    tabRegistry.reset();
    registerDefaultControlTabs();
  });

  it("defaults to hidden", () => {
    const settings = { ...DEFAULT_SETTINGS } as any;
    expect(settings.showTelemetryTab).toBe(false);
  });

  it("filters telemetry tab when disabled", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: false } as any;
    const allTabs = get(tabRegistry);
    const visible = allTabs.filter(
      (t) => t.id !== "telemetry" || settings.showTelemetryTab,
    );
    expect(visible.find((t) => t.id === "telemetry")).toBeUndefined();
  });
});
