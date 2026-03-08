// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export type DragPosition = "top" | "bottom";

export function calculateDragPosition(
  e: DragEvent,
  currentTarget: HTMLElement,
): DragPosition {
  const rect = currentTarget.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  return e.clientY < midY ? "top" : "bottom";
}

export function getClosestTarget(
  e: DragEvent,
  selector: string,
  container: HTMLElement,
): { element: HTMLElement; position: DragPosition } | null {
  const elements = Array.from(container.querySelectorAll(selector));
  if (elements.length === 0) return null;

  let closest: HTMLElement | null = null;
  let closestDist = Infinity;

  // We only care about vertical distance
  const mouseY = e.clientY;

  elements.forEach((el) => {
    const rect = el.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const dist = Math.abs(mouseY - centerY);
    if (dist < closestDist) {
      closestDist = dist;
      closest = el as HTMLElement;
    }
  });

  if (!closest) return null;

  const rect = (closest as HTMLElement).getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  const position = mouseY < midY ? "top" : "bottom";

  return { element: closest as HTMLElement, position };
}

export function reorderSequence<T>(
  sequence: T[],
  fromIndex: number,
  toIndex: number,
  position: DragPosition,
): T[] {
  // Target index logic:
  // If 'top', we want to insert at toIndex.
  // If 'bottom', we want to insert at toIndex + 1.
  let targetInsertionIndex = position === "top" ? toIndex : toIndex + 1;

  // If we are moving the item 'down' (from < target), the target index
  // will shift down by 1 when we remove the item.
  // Note: We use < because if fromIndex == targetInsertionIndex, it's a no-op
  // (inserting right back where it was).
  if (fromIndex < targetInsertionIndex) {
    targetInsertionIndex--;
  }

  const newSequence = [...sequence];
  const [item] = newSequence.splice(fromIndex, 1);
  newSequence.splice(targetInsertionIndex, 0, item);

  return newSequence;
}
