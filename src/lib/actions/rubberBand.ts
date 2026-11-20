// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Drag a box over empty space to select the items it touches.

interface RubberBandOptions {
  /**
   * The paths of the `[data-path]` items the box touches. `first` is true on
   * the first call of a drag; a plain click on empty space reports no paths.
   */
  onselect: (paths: string[], additive: boolean, first: boolean) => void;
}

const DRAG_THRESHOLD = 4;

/** Svelte action for a scrolling container whose items carry a `data-path`. */
export function rubberBand(node: HTMLElement, options: RubberBandOptions) {
  let current = options;
  let box: HTMLDivElement | null = null;
  let start: { x: number; y: number } | null = null;
  let additive = false;
  let reported = false;

  // Positions inside the container's scrolling content, so a scroll mid-drag
  // keeps the box where it was.
  const point = (e: MouseEvent) => {
    const r = node.getBoundingClientRect();
    return {
      x: e.clientX - r.left + node.scrollLeft,
      y: e.clientY - r.top + node.scrollTop,
    };
  };

  function hits(a: { x: number; y: number }, b: { x: number; y: number }) {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const c = node.getBoundingClientRect();
    return Array.from(node.querySelectorAll<HTMLElement>("[data-path]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const l = r.left - c.left + node.scrollLeft;
        const t = r.top - c.top + node.scrollTop;
        return (
          l < right && l + r.width > left && t < bottom && t + r.height > top
        );
      })
      .map((el) => el.dataset.path!);
  }

  function onMove(e: MouseEvent) {
    if (!start) return;
    const p = point(e);
    if (!box && Math.hypot(p.x - start.x, p.y - start.y) < DRAG_THRESHOLD) {
      return;
    }
    if (!box) {
      box = document.createElement("div");
      box.className =
        "absolute z-10 pointer-events-none border border-blue-500 bg-blue-500/10 rounded-sm";
      node.appendChild(box);
    }
    box.style.left = `${Math.min(p.x, start.x)}px`;
    box.style.top = `${Math.min(p.y, start.y)}px`;
    box.style.width = `${Math.abs(p.x - start.x)}px`;
    box.style.height = `${Math.abs(p.y - start.y)}px`;
    current.onselect(hits(start, p), additive, !reported);
    reported = true;
  }

  function onUp() {
    // A click on empty space, without dragging, clears the selection.
    if (start && !box && !additive) current.onselect([], false, true);
    stop();
  }

  function stop() {
    box?.remove();
    box = null;
    start = null;
    reported = false;
    globalThis.removeEventListener("mousemove", onMove);
    globalThis.removeEventListener("mouseup", onUp);
  }

  function onDown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (e.button !== 0 || target.closest("[data-path], button, input")) return;
    start = point(e);
    additive = e.ctrlKey || e.metaKey || e.shiftKey;
    globalThis.addEventListener("mousemove", onMove);
    globalThis.addEventListener("mouseup", onUp);
  }

  node.addEventListener("mousedown", onDown);
  return {
    update(next: RubberBandOptions) {
      current = next;
    },
    destroy() {
      node.removeEventListener("mousedown", onDown);
      stop();
    },
  };
}
