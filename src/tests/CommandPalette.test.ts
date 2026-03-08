// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import CommandPalette from "../lib/components/CommandPalette.svelte";

describe("CommandPalette", () => {
  const commands = [
    { id: "cmd1", label: "Command 1", action: vi.fn(), category: "Test" },
    { id: "cmd2", label: "Command 2", action: vi.fn(), category: "Test" },
  ];
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
    commands.forEach((cmd) => cmd.action.mockReset());
    // Mock scrollIntoView if needed
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders with dialog role and accessible name", () => {
    render(CommandPalette, { isOpen: true, commands, onClose });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // This expects the accessible name to be set, which is currently missing
    expect(dialog).toHaveAttribute("aria-label", "Command Palette");
  });

  it("input has accessible label", () => {
    render(CommandPalette, { isOpen: true, commands, onClose });
    const input = screen.getByPlaceholderText("Type a command or search...");
    expect(input).toHaveAttribute("aria-label", "Search commands");
  });

  it("results list has listbox role", () => {
    render(CommandPalette, { isOpen: true, commands, onClose });
    // This role is currently missing
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();
  });

  it("options have option role and aria-selected", async () => {
    render(CommandPalette, { isOpen: true, commands, onClose });

    // We need to wait for the component to render and process commands
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("input has aria-activedescendant", () => {
    render(CommandPalette, { isOpen: true, commands, onClose });
    const input = screen.getByPlaceholderText("Type a command or search...");
    const options = screen.getAllByRole("option");

    const activeId = input.getAttribute("aria-activedescendant");
    expect(activeId).toBeTruthy();
    expect(activeId).toBe(options[0].id);
  });
});
