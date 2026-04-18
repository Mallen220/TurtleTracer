import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import SaveNameDialog from "./SaveNameDialog.svelte";

describe("SaveNameDialog", () => {
  it("renders with default props", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    expect(screen.getByText("Save New File")).toBeInTheDocument();
    expect(
      screen.getByText("Enter a name for your new file:"),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("New Path");
  });

  it("handles custom props", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      defaultName: "Custom Name",
      title: "Custom Title",
      prompt: "Custom Prompt",
      onSave,
      onCancel,
    });

    expect(screen.getByText("Custom Title")).toBeInTheDocument();
    expect(screen.getByText("Custom Prompt")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Custom Name");
  });

  it("calls onCancel when Cancel button is clicked", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    await fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onSave with input value when Save button is clicked", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    const input = screen.getByRole("textbox");
    await fireEvent.input(input, { target: { value: "Updated Name" } });
    await fireEvent.click(screen.getByText("Save"));

    expect(onSave).toHaveBeenCalledWith("Updated Name");
  });

  it("does not call onSave if name is empty", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    const input = screen.getByRole("textbox");
    await fireEvent.input(input, { target: { value: "   " } });
    await fireEvent.click(screen.getByText("Save"));

    expect(onSave).not.toHaveBeenCalled();
  });

  it("handles Enter and Escape keys", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    const input = screen.getByRole("textbox");

    // Press Enter to save
    await fireEvent.input(input, { target: { value: "Enter Save" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("Enter Save");

    // Press Escape to cancel
    // Need to re-render or show because `show = false` after save
    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    // Escape on document body or window or input? The code has `onkeydown={handleKeydown}` on the input.
    const input2 =
      screen.getAllByRole("textbox")[1] || screen.getAllByRole("textbox")[0];
    await fireEvent.keyDown(input2, { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
  });

  it("stops propagation of key events", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();

    render(SaveNameDialog, {
      show: true,
      onSave,
      onCancel,
    });

    const input = screen.getByRole("textbox");

    // Fire generic event
    let stopPropagationCalled = false;
    let stopImmediatePropagationCalled = false;

    // Custom wrapper to intercept
    input.addEventListener(
      "keydown",
      (e) => {
        const origStop = e.stopPropagation;
        const origStopImm = e.stopImmediatePropagation;
        e.stopPropagation = () => {
          stopPropagationCalled = true;
          origStop.call(e);
        };
        e.stopImmediatePropagation = () => {
          stopImmediatePropagationCalled = true;
          origStopImm.call(e);
        };
      },
      { capture: true },
    ); // Use capture so we get it before Svelte handler

    await fireEvent.keyDown(input, { key: "a" });

    // Svelte handles it in bubble phase, wait for event processing
    await new Promise((r) => setTimeout(r, 0));

    // The spy didn't work before because the event was dispatched and the handler called its own methods on it.
    // An easier way is just testing if the event escapes the input.
    let bubbled = false;
    document.addEventListener("keydown", () => (bubbled = true));
    await fireEvent.keyDown(input, { key: "b" });
    expect(bubbled).toBe(false);
  });
});
