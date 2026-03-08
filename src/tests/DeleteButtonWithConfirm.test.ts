// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import DeleteButtonWithConfirm from "../lib/components/common/DeleteButtonWithConfirm.svelte";

describe("DeleteButtonWithConfirm", () => {
  it("renders correctly", () => {
    render(DeleteButtonWithConfirm);
    const button = screen.getByTitle("Delete");
    expect(button).toBeInTheDocument();
    // Verify aria-label defaults to title
    expect(button).toHaveAttribute("aria-label", "Delete");
  });

  it("requires two clicks to confirm", async () => {
    const { component } = render(DeleteButtonWithConfirm);
    const mockClickHandler = vi.fn();
    component.$on("click", mockClickHandler);

    const button = screen.getByTitle("Delete");

    // First click
    await fireEvent.click(button);

    // Should show "Confirm" text
    expect(screen.getByText("Confirm")).toBeInTheDocument();

    // Verify aria-label changes
    expect(button).toHaveAttribute("aria-label", "Confirm Deletion");

    // Should NOT have fired click event
    expect(mockClickHandler).not.toHaveBeenCalled();

    // Second click
    await fireEvent.click(button);

    // Should have fired click event
    expect(mockClickHandler).toHaveBeenCalled();
  });

  it("resets after timeout", async () => {
    vi.useFakeTimers();
    const { component } = render(DeleteButtonWithConfirm);
    const mockClickHandler = vi.fn();
    component.$on("click", mockClickHandler);

    const button = screen.getByTitle("Delete");

    // First click
    await fireEvent.click(button);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Confirm Deletion");

    // Advance timers
    await vi.advanceTimersByTimeAsync(3500);

    // Should revert to icon (Confirm text gone)
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Delete");

    // Click again (should be treated as first click)
    await fireEvent.click(button);
    expect(screen.getByText("Confirm")).toBeInTheDocument();
    expect(mockClickHandler).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("resets on blur", async () => {
    vi.useFakeTimers();
    render(DeleteButtonWithConfirm);
    const button = screen.getByTitle("Delete");

    // First click
    await fireEvent.click(button);
    expect(screen.getByText("Confirm")).toBeInTheDocument();

    // Blur
    await fireEvent.blur(button);

    // Wait for blur timeout (200ms)
    await vi.advanceTimersByTimeAsync(250);

    // Should revert
    expect(screen.queryByText("Confirm")).not.toBeInTheDocument();
    expect(button).toHaveAttribute("aria-label", "Delete");

    vi.useRealTimers();
  });
});
