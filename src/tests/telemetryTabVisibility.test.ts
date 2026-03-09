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

  it("defaults to visible", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: true } as any;
    expect(settings.showTelemetryTab).toBe(true);

    const tabs = get(tabRegistry);
    const hasTelemetry = tabs.some((t) => t.id === "telemetry");
    expect(hasTelemetry).toBe(true);
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
