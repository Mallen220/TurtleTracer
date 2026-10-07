// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { focusRequest } from "../../stores";

export type FocusTarget = {
  /** Element id the request refers to, e.g. "wait-abc123". */
  id: string;
  /** Which field of that element, e.g. "x" or "heading". */
  field: string;
  /** Ignore requests while false (e.g. while the tab is hidden). */
  enabled?: boolean;
};

/**
 * Svelte action: focuses (and selects) this input when a keyboard shortcut
 * or command asks for the given element's field via `focusRequest`.
 */
export function focusOnRequest(node: HTMLElement, target: FocusTarget) {
  let current = target;
  const unsubscribe = focusRequest.subscribe((req) => {
    if (current.enabled === false) return;
    if (req?.id === current.id && req.field === current.field) {
      node.focus();
      if (node instanceof HTMLInputElement) node.select();
    }
  });
  return {
    update(next: FocusTarget) {
      current = next;
    },
    destroy: unsubscribe,
  };
}
