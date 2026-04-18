import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import PluginConfirmDialog from "./PluginConfirmDialog.svelte";

describe("PluginConfirmDialog", () => {
  it("renders with correct text when show is true", () => {
    const { getByText } = render(PluginConfirmDialog, {
      show: true,
      title: "Test Confirm",
      message: "Are you sure you want to test this?",
      confirmText: "Yes",
      cancelText: "No",
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(getByText("Test Confirm")).toBeInTheDocument();
    expect(
      getByText("Are you sure you want to test this?"),
    ).toBeInTheDocument();
    expect(getByText("Yes")).toBeInTheDocument();
    expect(getByText("No")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(PluginConfirmDialog, {
      show: true,
      title: "Test Confirm",
      message: "Message",
      onConfirm,
      onCancel,
    });

    const confirmBtn = getByText("OK"); // default confirmText
    await fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText } = render(PluginConfirmDialog, {
      show: true,
      title: "Test Confirm",
      message: "Message",
      onConfirm,
      onCancel,
    });

    const cancelBtn = getByText("Cancel"); // default cancelText
    await fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalled();
  });
});
