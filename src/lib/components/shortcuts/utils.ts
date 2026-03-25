// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { selectedPointId, selectedLineId } from "../../../stores";
import { sequenceStore } from "../../projectStore";
import { actionRegistry } from "../../actionRegistry";

export function isUIElementFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
    (el as any).isContentEditable
  );
}

export function isInputFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
    (el as any).isContentEditable
  );
}

export function isButtonFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "BUTTON" || el.getAttribute("role") === "button";
}

export function shouldBlockShortcut(
  e: KeyboardEvent,
  actionId?: string,
): boolean {
  // Whitelist specific actions that should work even when input is focused
  if (
    actionId === "toggle-command-palette" ||
    actionId === "cycle-tabs-next" ||
    actionId === "cycle-tabs-prev" ||
    actionId === "select-code-tab" ||
    actionId === "select-paths-tab" ||
    actionId === "select-field-tab" ||
    actionId === "select-table-tab"
  )
    return false;
  if (e.key === "Escape") return false;
  if (isInputFocused()) return true;
  if (isButtonFocused()) {
    // If focused on a button, only block interaction keys (Space, Enter)
    // BUT allow them if modifiers are present (e.g. Shift+Enter)
    if (
      (e.key === " " || e.key === "Enter") &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      return true;
    }
  }
  return false;
}

// Helper: get the sequence index corresponding to the current selection
export function getSelectedSequenceIndex(): number | null {
  const sel = get(selectedPointId);
  const seq = get(sequenceStore);
  if (!sel) return null;

  // Selected item is a wait
  if (sel.startsWith("wait-")) {
    const wid = sel.substring(5);
    const idx = seq.findIndex(
      (s) => actionRegistry.get(s.kind)?.isWait && (s as any).id === wid,
    );
    return idx >= 0 ? idx : null;
  }

  // Selected item is a rotate
  if (sel.startsWith("rotate-")) {
    const rid = sel.substring(7);
    const idx = seq.findIndex(
      (s) => actionRegistry.get(s.kind)?.isRotate && (s as any).id === rid,
    );
    return idx >= 0 ? idx : null;
  }

  // Selected item is a point/control point; map to the selected line id
  if (sel.startsWith("point-")) {
    const targetId = get(selectedLineId) || null;
    if (!targetId) return null;
    const idx = seq.findIndex(
      (s) =>
        actionRegistry.get(s.kind)?.isPath && (s as any).lineId === targetId,
    );
    return idx >= 0 ? idx : null;
  }

  return null;
}
