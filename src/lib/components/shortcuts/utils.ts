// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { get } from "svelte/store";
import { selectedPointId, selectedLineId } from "../../../stores";
import { sequenceStore } from "../../projectStore";
import { actionRegistry } from "../../actionRegistry";
import type { ActionDefinition, SequenceItem } from "../../../types";

/** Input types that are clicked or dragged rather than typed into. */
const CLICKED_INPUT_TYPES = [
  "checkbox",
  "radio",
  "range",
  "button",
  "submit",
  "reset",
];
const NON_TEXT_INPUT_TYPES = [...CLICKED_INPUT_TYPES, "color", "file", "image"];

/** The type of the focused element if it is an <input>, else null. */
function focusedInputType(el: HTMLInputElement): string | null {
  if (el.tagName !== "INPUT") return null;
  return el.type ? el.type.toLowerCase() : "text";
}

export function isInputFocused(): boolean {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el) return false;

  const inputType = focusedInputType(el);
  if (inputType !== null) return !NON_TEXT_INPUT_TYPES.includes(inputType);

  return (
    ["TEXTAREA", "SELECT"].includes(el.tagName) || (el as any).isContentEditable
  );
}

export function isUIElementFocused(): boolean {
  return isInputFocused();
}

export function isButtonFocused(): boolean {
  const el = document.activeElement as HTMLInputElement | null;
  if (!el) return false;

  const inputType = focusedInputType(el);
  if (inputType !== null && CLICKED_INPUT_TYPES.includes(inputType)) {
    return true;
  }

  const role = el.getAttribute("role");
  const buttonRoles = ["button", "slider", "switch", "checkbox", "radio"];

  return (
    el.tagName === "BUTTON" || (role !== null && buttonRoles.includes(role))
  );
}

/** Actions that should still work while a text field has focus. */
const WORKS_WHILE_TYPING = new Set([
  "toggle-command-palette",
  "cycle-tabs-next",
  "cycle-tabs-prev",
  "select-code-tab",
  "select-paths-tab",
  "select-field-tab",
  "select-table-tab",
  "save-project",
  "save-file-as",
  "open-settings",
  "toggle-sidebar",
  "zoom-in",
  "zoom-out",
  "zoom-reset",
  "toggle-lock-view",
  "pan-view-up",
  "pan-view-down",
  "pan-view-left",
  "pan-view-right",
  "toggle-lock-field-view",
  "toggle-continuous-validation",
  "new-file",
  "open-file",
  "export-java",
  "export-points",
  "export-sequential",
  "export-pp",
  "export-gif",
  "export-image",
  "download-java",
  "copy-code",
  "copy-table",
  "docs",
  "focus-name",
  "confirm-dialog",
]);

export function shouldBlockShortcut(
  e: KeyboardEvent,
  actionId?: string,
): boolean {
  if (actionId && WORKS_WHILE_TYPING.has(actionId)) return false;
  if (e.key === "Escape") return false;
  if (isInputFocused()) return true;

  // On a focused button only Space and Enter, which press it, are blocked;
  // with a modifier (Shift+Enter, say) they still work.
  const noModifier = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
  return (
    isButtonFocused() && (e.key === " " || e.key === "Enter") && noModifier
  );
}

/** The index in the sequence of the first step of `kind` whose `field` is `value`. */
function indexOfStep(
  sequence: SequenceItem[],
  is: (action: ActionDefinition | undefined) => boolean | undefined,
  field: "id" | "lineId",
  value: string,
): number | null {
  const idx = sequence.findIndex(
    (s) => is(actionRegistry.get(s.kind)) && (s as any)[field] === value,
  );
  return idx >= 0 ? idx : null;
}

// Helper: get the sequence index corresponding to the current selection
export function getSelectedSequenceIndex(): number | null {
  const sel = get(selectedPointId);
  const sequence = get(sequenceStore);
  if (!sel) return null;

  if (sel.startsWith("wait-")) {
    return indexOfStep(sequence, (a) => a?.isWait, "id", sel.slice(5));
  }
  if (sel.startsWith("rotate-")) {
    return indexOfStep(sequence, (a) => a?.isRotate, "id", sel.slice(7));
  }
  // A point or control point: the path it belongs to.
  if (sel.startsWith("point-")) {
    const lineId = get(selectedLineId);
    return lineId
      ? indexOfStep(sequence, (a) => a?.isPath, "lineId", lineId)
      : null;
  }
  return null;
}
