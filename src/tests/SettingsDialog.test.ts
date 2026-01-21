import { render, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import SettingsDialog from "../lib/components/SettingsDialog.svelte";
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
    vi.resetAllMocks();
  });

  it("does not trigger onboarding after reset (marks hasSeenOnboarding true and persists it)", async () => {
    // Render the dialog open and pass a mutable settings object
    const settings = { ...DEFAULT_SETTINGS };

    // Stub confirm to accept reset
    const origConfirm = window.confirm;
    window.confirm = () => true;

    const { getByText } = render(SettingsDialog, {
      props: { isOpen: true, settings },
    });

    const btn = getByText("Reset All");
    await fireEvent.click(btn);

    expect(resetSettings).toHaveBeenCalled();
    expect(saveSettings).toHaveBeenCalled();

    const savedArg = (saveSettings as unknown as Mock).mock.calls[0][0];
    expect(savedArg.hasSeenOnboarding).toBe(true);

    // Restore confirm
    window.confirm = origConfirm;
  });
});
