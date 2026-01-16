// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.

/**
 * Action to handle keyboard navigation within a menu.
 * Supports Arrow keys (Up/Down), Home, End, and Escape.
 * Also supports basic type-ahead for printable characters.
 */
export function menuNavigation(
  node: HTMLElement,
  options: { focusOnMount?: boolean } = { focusOnMount: true },
) {
  const getFocusableItems = () =>
    Array.from(
      node.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null); // Visible only

  if (options.focusOnMount) {
    // Small timeout to allow DOM to settle if needed
    requestAnimationFrame(() => {
      const items = getFocusableItems();
      if (items.length > 0) items[0].focus();
      else node.focus();
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    const items = getFocusableItems();
    if (items.length === 0) return; // Guard against empty menus

    const currentIndex = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      node.dispatchEvent(new CustomEvent("close"));
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex =
        currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      let prevIndex = currentIndex - 1;
      if (prevIndex < 0) prevIndex = items.length - 1;
      items[prevIndex].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
        // Default Tab behavior
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      // Type-ahead
      const char = event.key.toLowerCase();
      // Start searching after current index
      let found = false;
      for (let i = 1; i < items.length + 1; i++) {
        const idx = (currentIndex + i) % items.length;
        const item = items[idx];
        if (item.textContent?.trim().toLowerCase().startsWith(char)) {
          event.preventDefault();
          item.focus();
          found = true;
          break;
        }
      }
    }
  }

  node.addEventListener("keydown", handleKeydown);

  return {
    destroy() {
      node.removeEventListener("keydown", handleKeydown);
    },
  };
}
