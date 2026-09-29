// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import pkg from "../../package.json";

const platform = vi.hoisted(() => ({ isBrowser: false }));
const saveSettings = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../utils/platform", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/platform")>()),
  get isBrowser() {
    return platform.isBrowser;
  },
}));
vi.mock("../utils/settingsPersistence", () => ({ saveSettings }));

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** A fresh copy of the module (and its launch time), with the clock at zero. */
async function launchApp() {
  vi.resetModules();
  vi.setSystemTime(0);
  const usage = await import("./usageTracking");
  const stores = await import("../stores");
  const { settingsStore } = await import("./projectStore");
  stores.showRatingDialog.set(false);
  stores.ratingDialogAutoOpened.set(false);
  return { ...usage, ...stores, settingsStore };
}

describe("usageTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    platform.isBrowser = false;
    saveSettings.mockClear();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("recordUsageTime", () => {
    it("adds the time since the last call and saves the settings", async () => {
      const { recordUsageTime, settingsStore } = await launchApp();
      settingsStore.update((s) => ({ ...s, totalUsageTime: 1000 }));

      vi.setSystemTime(5 * MINUTE);
      await recordUsageTime();
      expect(get(settingsStore).totalUsageTime).toBe(1000 + 5 * MINUTE);

      vi.setSystemTime(8 * MINUTE);
      await recordUsageTime();
      expect(get(settingsStore).totalUsageTime).toBe(1000 + 8 * MINUTE);
      expect(saveSettings).toHaveBeenCalledTimes(2);
      expect(saveSettings).toHaveBeenLastCalledWith(get(settingsStore));
    });

    it("starts from zero when no usage has been recorded", async () => {
      const { recordUsageTime, settingsStore } = await launchApp();
      settingsStore.update(({ totalUsageTime: _, ...s }) => s as any);

      vi.setSystemTime(MINUTE);
      await recordUsageTime();
      expect(get(settingsStore).totalUsageTime).toBe(MINUTE);
    });
  });

  describe("tryShowRatingDialog", () => {
    async function launchWithHeavyUse() {
      const app = await launchApp();
      app.settingsStore.update((s) => ({
        ...s,
        totalUsageTime: 10 * HOUR,
        submittedRatings: {},
        dismissedRatings: {},
      }));
      vi.setSystemTime(6 * MINUTE);
      return app;
    }

    it("asks once the user has used the app for ten hours", async () => {
      const app = await launchWithHeavyUse();
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(true);
      expect(get(app.ratingDialogAutoOpened)).toBe(true);
    });

    it("keeps counting but doesn't ask before ten hours", async () => {
      const app = await launchWithHeavyUse();
      app.settingsStore.update((s) => ({ ...s, totalUsageTime: 9 * HOUR }));
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
      await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
      expect(get(app.settingsStore).totalUsageTime).toBe(9 * HOUR + 6 * MINUTE);
    });

    it("leaves the first five minutes after launch alone", async () => {
      const app = await launchWithHeavyUse();
      vi.setSystemTime(4 * MINUTE);
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
      expect(saveSettings).not.toHaveBeenCalled();
    });

    it("doesn't ask in the browser version", async () => {
      const app = await launchWithHeavyUse();
      platform.isBrowser = true;
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
    });

    it("doesn't ask while offline", async () => {
      const app = await launchWithHeavyUse();
      vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
    });

    it("doesn't ask again once the user has rated any version", async () => {
      const app = await launchWithHeavyUse();
      app.settingsStore.update((s) => ({
        ...s,
        submittedRatings: { "0.0.1": 5 } as any,
      }));
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
    });

    it("doesn't ask after this version was dismissed", async () => {
      const app = await launchWithHeavyUse();
      app.settingsStore.update((s) => ({
        ...s,
        dismissedRatings: { [pkg.version]: true } as any,
      }));
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
    });

    it("still asks if only an older version was dismissed", async () => {
      const app = await launchWithHeavyUse();
      app.settingsStore.update((s) => ({
        ...s,
        dismissedRatings: { "0.0.1": true } as any,
      }));
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(true);
    });

    it("doesn't ask after 'never ask again'", async () => {
      const app = await launchWithHeavyUse();
      app.settingsStore.update((s) => ({
        ...s,
        dismissedRatings: { all: true } as any,
      }));
      app.tryShowRatingDialog();
      expect(get(app.showRatingDialog)).toBe(false);
    });

    it("doesn't reopen a dialog that is already showing", async () => {
      const app = await launchWithHeavyUse();
      app.showRatingDialog.set(true);
      app.tryShowRatingDialog();
      expect(get(app.ratingDialogAutoOpened)).toBe(false);
      expect(saveSettings).not.toHaveBeenCalled();
    });
  });

  describe("startRatingChecks", () => {
    it("checks every ten minutes until stopped", async () => {
      const app = await launchApp();
      app.settingsStore.update((s) => ({
        ...s,
        totalUsageTime: 10 * HOUR,
        submittedRatings: {},
        dismissedRatings: {},
      }));
      const stop = app.startRatingChecks();

      await vi.advanceTimersByTimeAsync(9 * MINUTE);
      expect(get(app.showRatingDialog)).toBe(false);

      await vi.advanceTimersByTimeAsync(2 * MINUTE);
      expect(get(app.showRatingDialog)).toBe(true);

      app.showRatingDialog.set(false);
      stop();
      await vi.advanceTimersByTimeAsync(HOUR);
      expect(get(app.showRatingDialog)).toBe(false);
    });
  });
});
