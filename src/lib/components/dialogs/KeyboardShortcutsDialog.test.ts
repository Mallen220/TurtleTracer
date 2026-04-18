// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import KeyboardShortcutsDialog from "./KeyboardShortcutsDialog.svelte";
import { DEFAULT_SETTINGS } from "../../../config/defaults";

vi.mock("../../../stores", () => ({
  notification: { show: vi.fn() },
}));

describe("KeyboardShortcutsDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByText } = render(KeyboardShortcutsDialog, {
      isOpen: true,
      settings: DEFAULT_SETTINGS,
    });

    expect(
      getByText("Keyboard Shortcuts", { selector: "h2" }),
    ).toBeInTheDocument();
  });

  it("can interact with the search input", async () => {
    const { getByPlaceholderText } = render(KeyboardShortcutsDialog, {
      isOpen: true,
      settings: DEFAULT_SETTINGS,
    });

    const searchInput = getByPlaceholderText("Search shortcuts...");
    await fireEvent.input(searchInput, { target: { value: "Save" } });
    expect(searchInput).toHaveValue("Save");
  });
});
