import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
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
    const { getByText, container } = render(SettingsItem, {
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

    const resetBtn = getByRole("button", { name: "Reset My Setting" });
    await fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalled();
  });
});
