// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import SettingsItem from "./SettingsItem.svelte";

describe("SettingsItem", () => {
  it("renders basic properties", () => {
    const { getByText } = render(SettingsItem, {
      label: "My Setting",
      description: "Setting description",
    });

    expect(getByText("My Setting")).toBeInTheDocument();
    expect(getByText("Setting description")).toBeInTheDocument();
  });

  it("hides when search query does not match", () => {
    // The component applies a class 'hidden' to the wrapper div.
    // So we check if the parent div has the 'hidden' class
    const { container } = render(SettingsItem, {
      label: "My Setting",
      description: "Setting description",
      searchQuery: "xyz",
    });

    const div = container.querySelector("div.transition-all");
    expect(div).toHaveClass("hidden");
  });

  it("shows when search query matches label", () => {
    const { getByText, container } = render(SettingsItem, {
      label: "My Setting",
      description: "Setting description",
      searchQuery: "my",
    });

    const div = container.querySelector("div.transition-all");
    expect(div).not.toHaveClass("hidden");
    expect(getByText("My Setting")).toBeInTheDocument();
  });

  it("handles reset button when isModified is true", async () => {
    const onReset = vi.fn();
    const { getByRole } = render(SettingsItem, {
      label: "My Setting",
      onReset,
      isModified: true,
    });

    const resetBtn = getByRole("button", { name: "Reset to default" });
    await fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();
  });

  describe("naming the control inside", () => {
    const control = (html: string) =>
      createRawSnippet(() => ({ render: () => html }));

    it("names a bare checkbox by the setting's label", () => {
      render(SettingsItem, {
        label: "Show grid",
        layout: "row",
        children: control('<input type="checkbox" />'),
      });
      expect(screen.getByRole("checkbox", { name: "Show grid" })).toBeTruthy();
    });

    it("names a bare select in the column layout too", () => {
      render(SettingsItem, {
        label: "Units",
        children: control("<select><option>in</option></select>"),
      });
      expect(screen.getByRole("combobox", { name: "Units" })).toBeTruthy();
    });

    it("leaves a control that already has a name alone", () => {
      render(SettingsItem, {
        label: "Size",
        children: control('<input type="number" aria-label="Width" />'),
      });
      expect(screen.getByRole("spinbutton", { name: "Width" })).toBeTruthy();
    });
  });
});
