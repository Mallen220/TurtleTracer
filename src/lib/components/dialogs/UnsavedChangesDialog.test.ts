// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import UnsavedChangesDialog from "./UnsavedChangesDialog.svelte";

describe("UnsavedChangesDialog", () => {
  it("renders when show is true and triggers events", async () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const onCancel = vi.fn();

    const { getByText } = render(UnsavedChangesDialog, {
      show: true,
      onSave,
      onDiscard,
      onCancel,
    });

    expect(getByText("Unsaved Changes")).toBeInTheDocument();

    await fireEvent.click(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();

    await fireEvent.click(getByText("Discard Changes"));
    expect(onDiscard).toHaveBeenCalled();

    await fireEvent.click(getByText("Save"));
    expect(onSave).toHaveBeenCalled();
  });

  it("does not render when show is false", () => {
    const { queryByText } = render(UnsavedChangesDialog, {
      show: false,
      onSave: vi.fn(),
      onDiscard: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(queryByText("Unsaved Changes")).not.toBeInTheDocument();
  });

  it("calls onCancel when Escape key is pressed", async () => {
    const onCancel = vi.fn();
    render(UnsavedChangesDialog, {
      show: true,
      onSave: vi.fn(),
      onDiscard: vi.fn(),
      onCancel,
    });

    await fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });
});
