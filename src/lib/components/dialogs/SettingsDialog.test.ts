import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import SettingsDialog from "./SettingsDialog.svelte";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("../../../stores", () => ({
  settingsActiveTab: {
    subscribe: vi.fn((fn) => {
      fn("general");
      return () => {};
    }),
    set: vi.fn()
  },
  theme: {
    subscribe: vi.fn((fn) => {
      fn("light");
      return () => {};
    }),
  }
}));

describe("SettingsDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(SettingsDialog, {
      isOpen: true,
      settings: DEFAULT_SETTINGS
    });

    expect(getByText("Settings", { selector: "h2" })).toBeInTheDocument();
  });

  it("does not render when isOpen is false", () => {
    const { queryByText } = render(SettingsDialog, {
      isOpen: false,
      settings: DEFAULT_SETTINGS
    });

    expect(queryByText("Settings", { selector: "h2" })).not.toBeInTheDocument();
  });

  it("can interact with the close button", async () => {
    const { getByLabelText } = render(SettingsDialog, {
      isOpen: true,
      settings: DEFAULT_SETTINGS
    });

    const closeBtn = getByLabelText("Close settings");
    await fireEvent.click(closeBtn);
  });

  it("saves when save button is clicked", async () => {
    const { getByText } = render(SettingsDialog, {
      isOpen: true,
      settings: DEFAULT_SETTINGS
    });

    const saveBtn = getByText("Save");
    await fireEvent.click(saveBtn);
  });
});
