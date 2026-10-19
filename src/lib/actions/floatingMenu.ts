// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the pop-up menus share: closing on an outside click, and staying on screen.
import { tick } from "svelte";

/**
 * Where to put a menu opened at (x, y): there, unless it would run off the
 * right or bottom edge of the window, in which case it opens up and to the left.
 */
export function keepOnScreen(
  x: number,
  y: number,
  menu: HTMLElement,
): { x: number; y: number } {
  const rect = menu.getBoundingClientRect();
  return {
    x: x + rect.width > window.innerWidth ? x - rect.width : x,
    y: y + rect.height > window.innerHeight ? y - rect.height : y,
  };
}

interface FloatingMenuOptions {
  x: number;
  y: number;
  /** Called when the mouse goes down outside the menu. */
  onclose: () => void;
}

/** Svelte action for a `position: fixed` menu: puts it at (x, y), kept on screen, and closes it on an outside click. */
export function floatingMenu(node: HTMLElement, options: FloatingMenuOptions) {
  let current = options;

  const place = () => {
    // Wait a tick so the menu has been drawn and has a size to measure.
    void tick().then(() => {
      const spot = keepOnScreen(current.x, current.y, node);
      node.style.left = `${spot.x}px`;
      node.style.top = `${spot.y}px`;
    });
  };

  const closeOnOutsideClick = (event: MouseEvent) => {
    if (!node.contains(event.target as Node)) current.onclose();
  };

  node.style.left = `${options.x}px`;
  node.style.top = `${options.y}px`;
  place();
  document.addEventListener("mousedown", closeOnOutsideClick);

  return {
    update(next: FloatingMenuOptions) {
      current = next;
      place();
    },
    destroy() {
      document.removeEventListener("mousedown", closeOnOutsideClick);
    },
  };
}
