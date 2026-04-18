// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import PluginPromptDialog from "./PluginPromptDialog.svelte";

describe("PluginPromptDialog", () => {
  it("renders correctly when show is true", () => {
    const { getByText, getByRole } = render(PluginPromptDialog, {
      show: true,
      title: "Test Prompt",
      message: "Please enter your name",
      defaultText: "John Doe",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(getByText("Test Prompt")).toBeInTheDocument();
    expect(getByText("Please enter your name")).toBeInTheDocument();
    expect(getByRole("textbox")).toHaveValue("John Doe");
  });

  it("calls onConfirm with input value when OK button is clicked", async () => {
    const onConfirm = vi.fn();
    const { getByText, getByRole } = render(PluginPromptDialog, {
      show: true,
      title: "Test",
      message: "Message",
      onConfirm,
      onCancel: vi.fn(),
    });

    const input = getByRole("textbox");
    await fireEvent.input(input, { target: { value: "New Value" } });

    const okBtn = getByText("OK");
    await fireEvent.click(okBtn);

    expect(onConfirm).toHaveBeenCalledWith("New Value");
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const onCancel = vi.fn();
    const { getByText } = render(PluginPromptDialog, {
      show: true,
      title: "Test",
      message: "Message",
      onConfirm: vi.fn(),
      onCancel,
    });

    const cancelBtn = getByText("Cancel");
    await fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });

  it("handles Enter keydown to confirm", async () => {
    const onConfirm = vi.fn();
    const { getByRole } = render(PluginPromptDialog, {
      show: true,
      title: "Test",
      defaultText: "Test Value",
      onConfirm,
      onCancel: vi.fn(),
    });

    const input = getByRole("textbox");
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith("Test Value");
  });

  it("handles Escape keydown to cancel", async () => {
    const onCancel = vi.fn();
    const { getByRole } = render(PluginPromptDialog, {
      show: true,
      title: "Test",
      onConfirm: vi.fn(),
      onCancel,
    });

    const input = getByRole("textbox");
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
