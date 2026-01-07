// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
export function tooltipPortal(node: HTMLElement, anchor: HTMLElement | null) {
  // Move node to document.body so it isn't clipped by overflow:hidden/auto containers
  const placeholder = document.createComment("portal-placeholder");
  const originalParent = node.parentNode;

  // Detach and append to body
  originalParent?.replaceChild(placeholder, node);
  document.body.appendChild(node);

  node.style.position = "absolute";
  node.style.zIndex = "9999";

  let currentAnchor: HTMLElement | null = anchor;

  function updatePosition(a: HTMLElement | null) {
    currentAnchor = a;
    if (!currentAnchor) {
      node.style.display = "none";
      return;
    }

    node.style.display = "block";

    // Small timeout to ensure DOM has laid out and tooltip has size
    requestAnimationFrame(() => {
      const aRect = currentAnchor!.getBoundingClientRect();
      const tRect = node.getBoundingClientRect();

      // By default align right edge of tooltip with right edge of anchor (like right-0)
      let left = aRect.right - tRect.width;
      // If it would overflow viewport, clamp
      left = Math.max(8, Math.min(left, window.innerWidth - tRect.width - 8));

      // Place above the anchor (bottom-full); if not enough space, place below
      let top = aRect.top - tRect.height - 8;
      if (top < 8) top = aRect.bottom + 8;

      node.style.left = `${Math.round(left)}px`;
      node.style.top = `${Math.round(top)}px`;
    });
  }

  function handleWindow() {
    updatePosition(currentAnchor);
  }

  window.addEventListener("resize", handleWindow);
  window.addEventListener("scroll", handleWindow, true);

  // initial
  updatePosition(anchor || null);

  return {
    update(newAnchor: HTMLElement | null) {
      updatePosition(newAnchor || null);
    },
    destroy() {
      window.removeEventListener("resize", handleWindow);
      window.removeEventListener("scroll", handleWindow, true);
      // Remove tooltip from body and try to put placeholder back (cleanup)
      if (node.parentNode === document.body) document.body.removeChild(node);
      if (placeholder.parentNode && originalParent) {
        placeholder.parentNode.replaceChild(node, placeholder);
      }
    },
  };
}
