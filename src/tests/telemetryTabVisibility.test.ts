// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { tabRegistry } from "../lib/registries";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { get } from "svelte/store";
import { registerDefaultControlTabs } from "../lib/ControlTab.svelte";
import * as platform from "../utils/platform";

vi.mock("../utils/platform", () => ({
  isBrowser: false,
}));

describe("Telemetry tab visibility setting", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    // clear any previously registered tabs
    tabRegistry.reset();
    registerDefaultControlTabs();
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: originalOnLine,
    });
  });

  it("defaults to visible", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: true } as any;
    expect(settings.showTelemetryTab).toBe(true);

    const tabs = get(tabRegistry);
    const hasTelemetry = tabs.some((t) => t.id === "telemetry");
    expect(hasTelemetry).toBe(true);
  });

  it("filters telemetry tab when disabled via settings", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: false } as any;
    const allTabs = get(tabRegistry);
    const visible = allTabs.filter(
      (t) => t.id !== "telemetry" || settings.showTelemetryTab,
    );
    expect(visible.find((t) => t.id === "telemetry")).toBeUndefined();
  });

  it("filters telemetry tab when online in browser regardless of settings", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: true } as any;

    // Simulate browser + online
    (platform as any).isBrowser = true;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    const isOnline = navigator.onLine;
    const shouldShowTelemetry =
      settings.showTelemetryTab && !(platform.isBrowser && isOnline);

    const allTabs = get(tabRegistry);
    const visible = allTabs.filter(
      (t) => t.id !== "telemetry" || shouldShowTelemetry,
    );
    expect(visible.find((t) => t.id === "telemetry")).toBeUndefined();
  });

  it("shows telemetry tab when offline in browser if setting is true", () => {
    const settings = { ...DEFAULT_SETTINGS, showTelemetryTab: true } as any;

    // Simulate browser + offline
    (platform as any).isBrowser = true;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    const isOnline = navigator.onLine;
    const shouldShowTelemetry =
      settings.showTelemetryTab && !(platform.isBrowser && isOnline);

    const allTabs = get(tabRegistry);
    const visible = allTabs.filter(
      (t) => t.id !== "telemetry" || shouldShowTelemetry,
    );
    expect(visible.find((t) => t.id === "telemetry")).toBeDefined();
  });
});
