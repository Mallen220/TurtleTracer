// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, beforeEach } from "vitest";
import InterfaceSettingsTabWrapper from "./InterfaceSettingsTabWrapper.svelte";
import { applySquaredCorners } from "../lib/appearance";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { mergeSettings } from "../utils/settingsPersistence";
import type { Settings } from "../types";

const settings = (over: Partial<Settings> = {}): Settings =>
  ({ ...DEFAULT_SETTINGS, ...over }) as Settings;

const hasClass = () =>
  document.documentElement.classList.contains("squared-corners");

describe("applySquaredCorners", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("squared-corners");
  });

  it("turns the squared look on and off", () => {
    applySquaredCorners(settings({ squaredCorners: true }));
    expect(hasClass()).toBe(true);
    applySquaredCorners(settings({ squaredCorners: false }));
    expect(hasClass()).toBe(false);
  });

  it("is off when the setting is missing, as in older saved settings", () => {
    applySquaredCorners(settings({ squaredCorners: undefined }));
    expect(hasClass()).toBe(false);
  });

  it("can be applied repeatedly without stacking", () => {
    applySquaredCorners(settings({ squaredCorners: true }));
    applySquaredCorners(settings({ squaredCorners: true }));
    expect(
      document.documentElement.className.match(/squared-corners/g),
    ).toHaveLength(1);
  });

  it("leaves potato mode with its own rounded look", () => {
    applySquaredCorners(
      settings({ squaredCorners: true, robotImage: "/JefferyThePotato.png" }),
    );
    expect(hasClass()).toBe(false);
  });
});

describe("the setting", () => {
  it("is off by default, so existing installs look the same", () => {
    expect(DEFAULT_SETTINGS.squaredCorners).toBe(false);
  });

  it("is kept when settings are loaded, and ignored if it isn't a boolean", () => {
    expect(mergeSettings({ squaredCorners: true }).squaredCorners).toBe(true);
    expect(mergeSettings({ squaredCorners: "yes" }).squaredCorners).toBe(false);
    expect(mergeSettings({}).squaredCorners).toBe(false);
  });
});

describe("the Square Corners row in Settings", () => {
  const mount = (props: Record<string, unknown> = {}) => {
    const view = render(InterfaceSettingsTabWrapper, props as any);
    return {
      ...view,
      current: () => (view.component as any).getSettings() as Settings,
    };
  };
  const checkbox = () =>
    screen.getByLabelText("Square Corners") as HTMLInputElement;

  it("shows the current choice and saves changes to it", async () => {
    const t = mount();
    expect(checkbox().checked).toBe(false);
    await fireEvent.click(checkbox());
    expect(t.current().squaredCorners).toBe(true);
    await fireEvent.click(checkbox());
    expect(t.current().squaredCorners).toBe(false);
  });

  it("starts checked when the setting is on", () => {
    mount({ initial: { squaredCorners: true } });
    expect(checkbox().checked).toBe(true);
  });

  it("offers a reset to the default once it has been changed", async () => {
    const t = mount({ initial: { squaredCorners: true } });
    const reset = screen
      .getAllByTitle(/reset/i)
      .find((b) =>
        b.closest("[id], div")?.textContent?.includes("Square Corners"),
      );
    expect(reset).toBeDefined();
    await fireEvent.click(reset!);
    expect(t.current().squaredCorners).toBe(false);
  });

  // Searching hides non-matching settings with a `hidden` class.
  const rowIsHidden = () =>
    checkbox().closest(".transition-all")!.classList.contains("hidden");

  it("can be found by searching settings", () => {
    mount({ searchQuery: "square" });
    expect(rowIsHidden()).toBe(false);
  });

  it("can also be found by words in its description", () => {
    mount({ searchQuery: "rounded" });
    expect(rowIsHidden()).toBe(false);
  });

  it("is hidden when the search doesn't match", () => {
    mount({ searchQuery: "zzzz nothing matches" });
    expect(rowIsHidden()).toBe(true);
  });
});
