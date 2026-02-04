import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SearchableDropdown from "../lib/components/common/SearchableDropdown.svelte";

describe("SearchableDropdown", () => {
  const options = ["Option 1", "Option 2", "Option 3"];

  beforeEach(() => {
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders with placeholder", () => {
    render(SearchableDropdown, { options, placeholder: "Test Placeholder" });
    const input = screen.getByPlaceholderText("Test Placeholder");
    expect(input).toBeInTheDocument();
  });

  it("shows options when typing", async () => {
    render(SearchableDropdown, { options });
    const input = screen.getByRole("combobox");

    await fireEvent.input(input, { target: { value: "Option" } });

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("filters options based on input", async () => {
    render(SearchableDropdown, { options });
    const input = screen.getByRole("combobox");

    await fireEvent.input(input, { target: { value: "1" } });

    const visibleOptions = screen.getAllByRole("option");
    expect(visibleOptions).toHaveLength(1);
    expect(visibleOptions[0]).toHaveTextContent("Option 1");
  });

  it("navigates options with arrow keys", async () => {
    render(SearchableDropdown, { options });
    const input = screen.getByRole("combobox");

    // Open dropdown
    await fireEvent.input(input, { target: { value: "" } });
    await fireEvent.focus(input);

    // Down arrow -> Select first
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    let option1 = screen.getByText("Option 1");
    expect(option1.getAttribute("aria-selected")).toBe("true");

    // Down arrow -> Select second
    await fireEvent.keyDown(input, { key: "ArrowDown" });
    let option2 = screen.getByText("Option 2");
    expect(option2.getAttribute("aria-selected")).toBe("true");
    expect(option1.getAttribute("aria-selected")).toBe("false");

    // Up arrow -> Select first
    await fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(option1.getAttribute("aria-selected")).toBe("true");
  });

  it("selects option on Enter", async () => {
    const { component } = render(SearchableDropdown, { options });
    const input = screen.getByRole("combobox");

    const changeHandler = vi.fn();
    component.$on("change", changeHandler);

    await fireEvent.focus(input);
    await fireEvent.keyDown(input, { key: "ArrowDown" }); // Select Option 1
    await fireEvent.keyDown(input, { key: "Enter" });

    expect(changeHandler).toHaveBeenCalledWith(expect.objectContaining({ detail: "Option 1" }));
    // Dropdown should be considered closed (aria-expanded=false)
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on Escape", async () => {
    render(SearchableDropdown, { options });
    const input = screen.getByRole("combobox");

    await fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");

    await fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
