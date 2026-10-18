// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.

interface Size {
  width: number;
  height: number;
}

/** Svelte action: calls `onResize` with the element's size when it first has one and whenever it changes. */
export function observeSize(node: HTMLElement, onResize: (size: Size) => void) {
  if (typeof ResizeObserver === "undefined") return;

  let current = onResize;
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) current(entry.contentRect);
  });
  observer.observe(node);

  return {
    update(next: (size: Size) => void) {
      current = next;
    },
    destroy() {
      observer.disconnect();
    },
  };
}
