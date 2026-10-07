// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import SettingsDialog from "../lib/components/dialogs/SettingsDialog.svelte";
import { DEFAULT_SETTINGS } from "../config/defaults";

vi.mock("../utils/settingsPersistence", () => {
  return {
    resetSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
    saveSettings: vi.fn(async () => true),
  };
});

import { resetSettings, saveSettings } from "../utils/settingsPersistence";

describe("SettingsDialog", () => {
  beforeEach(() => {
    // Only clear call history; preserve mock implementations declared above
    vi.clearAllMocks();
  });

  it("does not trigger onboarding after reset (marks hasSeenOnboarding true and persists it)", async () => {
    // Render the dialog open and pass a mutable settings object
    const settings = { ...DEFAULT_SETTINGS };

    // Stub confirm to accept reset
    const origConfirm = globalThis.confirm;
    globalThis.confirm = () => true;

    const { getByText } = render(SettingsDialog, {
      props: { isOpen: true, settings },
    });

    const btn = getByText("Reset Defaults");
    await fireEvent.click(btn);

    expect(resetSettings).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalled();

    const savedArg = (saveSettings as unknown as Mock).mock.calls[0][0];
    expect(savedArg.hasSeenOnboarding).toBe(true);

    // Restore confirm
    globalThis.confirm = origConfirm;
  });

  it("fetches the download count only once the dialog opens", async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("page=1")
          ? [
              {
                assets: [
                  { name: "Turtle-Setup.exe", download_count: 40 },
                  { name: "Turtle.dmg", download_count: 2 },
                  { name: "latest.yml", download_count: 999 },
                ],
              },
            ]
          : [],
    }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { rerender, findByText } = render(SettingsDialog, {
        props: { isOpen: false, settings: { ...DEFAULT_SETTINGS } },
      });
      expect(fetchMock).not.toHaveBeenCalled();

      await rerender({ isOpen: true });
      expect(await findByText("42 Downloads")).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
