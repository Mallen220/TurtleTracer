// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import SequenceItemCardWrapper from "./SequenceItemCardWrapper.svelte";
import { registerCoreUI } from "../lib/coreRegistrations";
import { actionRegistry } from "../lib/actionRegistry";
import { selectedLineId, selectedPointId } from "../stores";
import type { SequenceItem } from "../types";

const wait = (over: Record<string, unknown> = {}) =>
  ({
    kind: "wait",
    id: "w1",
    name: "Grab",
    durationMs: 500,
    ...over,
  }) as SequenceItem;

function mount(item: SequenceItem, props: Record<string, unknown> = {}) {
  const callbacks = {
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onAddAction: vi.fn(),
    recordChange: vi.fn(),
  };
  const view = render(SequenceItemCardWrapper, {
    initial: [item],
    ...callbacks,
    ...props,
  } as any);
  return {
    ...callbacks,
    unmount: view.unmount,
    sequence: () => (view.component as any).getSequence() as any[],
  };
}

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
  selectedPointId.set(null);
  selectedLineId.set(null);
});

describe("SequenceItemCard", () => {
  it("shows the label, name, body and extra header buttons", () => {
    mount(wait());
    expect(screen.getByLabelText("Collapse wait")).toHaveTextContent("Wait");
    expect((screen.getByLabelText("Wait name") as HTMLInputElement).value).toBe(
      "Grab",
    );
    expect(screen.getByText("Card body")).toBeInTheDocument();
    expect(screen.getByLabelText("Extra button")).toBeInTheDocument();
  });

  it("uses the label as the placeholder for an unnamed item", () => {
    mount(wait({ name: "" }), { label: "Rotate", accent: "pink" });
    expect(screen.getByLabelText("Rotate name")).toHaveAttribute(
      "placeholder",
      "Rotate",
    );
  });

  it("reports renames as they're typed, and records the change when the box is left", async () => {
    const t = mount(wait());
    const box = screen.getByLabelText("Wait name");
    await fireEvent.input(box, { target: { value: "Drop" } });
    expect(t.onRename).toHaveBeenCalledWith("Drop");
    await fireEvent.blur(box);
    expect(t.recordChange).toHaveBeenCalledTimes(1);
  });

  describe("collapsing", () => {
    it("hides the body, and brings it back", async () => {
      mount(wait());
      await fireEvent.click(screen.getByLabelText("Collapse wait"));
      await waitFor(() => expect(screen.queryByText("Card body")).toBeNull());
      expect(screen.getByLabelText("Expand wait")).toHaveAttribute(
        "aria-expanded",
        "false",
      );
      await fireEvent.click(screen.getByLabelText("Expand wait"));
      await waitFor(() =>
        expect(screen.getByText("Card body")).toBeInTheDocument(),
      );
    });
  });

  describe("selecting", () => {
    it("selects the item, and deselects any path", async () => {
      selectedLineId.set("some-line");
      mount(wait());
      await fireEvent.click(screen.getByRole("button", { pressed: false }));
      expect(get(selectedPointId)).toBe("wait-w1");
      expect(get(selectedLineId)).toBeNull();
    });

    it("selects from the keyboard with Enter or Space, but not other keys", async () => {
      mount(wait());
      const card = screen.getByRole("button", { pressed: false });
      await fireEvent.keyDown(card, { key: "x" });
      expect(get(selectedPointId)).toBeNull();
      await fireEvent.keyDown(card, { key: "Enter" });
      expect(get(selectedPointId)).toBe("wait-w1");
      selectedPointId.set(null);
      await fireEvent.keyDown(card, { key: " " });
      expect(get(selectedPointId)).toBe("wait-w1");
    });

    it("can't select a locked item", async () => {
      mount(wait({ locked: true }));
      await fireEvent.click(screen.getByRole("button", { pressed: false }));
      expect(get(selectedPointId)).toBeNull();
    });

    it("shows the accent colour of the kind of step when selected", async () => {
      const { unmount } = mount(wait(), { accent: "amber" });
      selectedPointId.set("wait-w1");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { pressed: true }).className,
        ).toContain("border-amber-400"),
      );
      unmount();

      mount(
        { kind: "rotate", id: "r1", name: "", degrees: 1 } as SequenceItem,
        {
          accent: "pink",
          label: "Rotate",
        },
      );
      selectedPointId.set("rotate-r1");
      await waitFor(() =>
        expect(
          screen.getByRole("button", { pressed: true }).className,
        ).toContain("border-pink-500"),
      );
    });
  });

  describe("hiding and locking", () => {
    it("hides and shows the item, recording each change", async () => {
      const t = mount(wait());
      await fireEvent.click(screen.getByLabelText("Hide Wait"));
      await waitFor(() =>
        expect(screen.getByLabelText("Show Wait")).toBeInTheDocument(),
      );
      expect(t.sequence()[0].hidden).toBe(true);
      await fireEvent.click(screen.getByLabelText("Show Wait"));
      await waitFor(() =>
        expect(screen.getByLabelText("Hide Wait")).toBeInTheDocument(),
      );
      expect(t.sequence()[0].hidden).toBe(false);
      expect(t.recordChange).toHaveBeenCalledTimes(2);
    });

    it("locks the item, which disables its name, movement and removal", async () => {
      const t = mount(wait());
      await fireEvent.click(screen.getByLabelText("Lock Wait"));
      await waitFor(() =>
        expect(screen.getByLabelText("Unlock Wait")).toBeInTheDocument(),
      );
      expect(t.sequence()[0].locked).toBe(true);
      expect(screen.getByLabelText("Wait name")).toBeDisabled();
      expect(screen.getByLabelText("Move Up")).toBeDisabled();
      expect(screen.getByLabelText("Move Down")).toBeDisabled();
      expect(screen.getByLabelText("Remove Wait")).toBeDisabled();

      await fireEvent.click(screen.getByLabelText("Unlock Wait"));
      await waitFor(() =>
        expect(screen.getByLabelText("Wait name")).not.toBeDisabled(),
      );
    });

    it("only changes the item it belongs to", async () => {
      const other = wait({ id: "w2", name: "Other" });
      const t = mount(wait(), { initial: [wait(), other] });
      await fireEvent.click(screen.getByLabelText("Hide Wait"));
      await waitFor(() => expect(t.sequence()[0].hidden).toBe(true));
      expect(t.sequence()[1].hidden).toBeUndefined();
    });
  });

  describe("moving and removing", () => {
    it("calls the move callbacks", async () => {
      const t = mount(wait());
      await fireEvent.click(screen.getByLabelText("Move Up"));
      await fireEvent.click(screen.getByLabelText("Move Down"));
      expect(t.onMoveUp).toHaveBeenCalledTimes(1);
      expect(t.onMoveDown).toHaveBeenCalledTimes(1);
    });

    it("disables the arrow that can't be used", () => {
      mount(wait(), { canMoveUp: false, canMoveDown: false });
      expect(screen.getByLabelText("Move Up")).toBeDisabled();
      expect(screen.getByLabelText("Move Down")).toBeDisabled();
    });

    it("asks for confirmation before removing", async () => {
      const t = mount(wait());
      await fireEvent.click(screen.getByLabelText("Remove Wait"));
      expect(t.onRemove).not.toHaveBeenCalled();
      await fireEvent.click(screen.getByLabelText("Confirm Deletion"));
      expect(t.onRemove).toHaveBeenCalledTimes(1);
    });
  });

  describe("linked items", () => {
    it("explains the link in a tooltip while hovering the link icon", async () => {
      mount(wait(), {
        linkedNote: "Shares its duration with other waits named 'Grab'.",
      });
      const icon = document.querySelector(".cursor-help")!;
      expect(icon).not.toBeNull();
      await fireEvent.mouseEnter(icon);
      expect(await screen.findByText("Linked Wait")).toBeInTheDocument();
      expect(screen.getByText(/Shares its duration/)).toBeInTheDocument();
    });

    it("shows no link icon without a note", () => {
      mount(wait());
      expect(document.querySelector(".cursor-help")).toBeNull();
    });
  });

  it("adds a step after this one from the insert bar", async () => {
    const t = mount(wait());
    await fireEvent.click(screen.getByLabelText("Add Rotate After"));
    expect(t.onAddAction).toHaveBeenCalledTimes(1);
    expect(t.onAddAction.mock.calls[0][0]).toMatchObject({ kind: "rotate" });
  });
});
