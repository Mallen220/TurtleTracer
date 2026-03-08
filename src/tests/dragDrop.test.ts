// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  reorderSequence,
  calculateDragPosition,
  getClosestTarget,
} from "../utils/dragDrop";

describe("reorderSequence", () => {
  const letters = ["a", "b", "c", "d", "e"];

  it("moves an item down (top insertion)", () => {
    // Move 'a' (0) to 'c' (2) top -> should insert before 'c'
    // new array: b, a, c, d, e
    const result = reorderSequence(letters, 0, 2, "top");
    expect(result).toEqual(["b", "a", "c", "d", "e"]);
  });

  it("moves an item down (bottom insertion)", () => {
    // Move 'a' (0) to 'c' (2) bottom -> should insert after 'c'
    // new array: b, c, a, d, e
    const result = reorderSequence(letters, 0, 2, "bottom");
    expect(result).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("moves an item up (top insertion)", () => {
    // Move 'e' (4) to 'b' (1) top -> insert before 'b'
    // new array: a, e, b, c, d
    const result = reorderSequence(letters, 4, 1, "top");
    expect(result).toEqual(["a", "e", "b", "c", "d"]);
  });

  it("moves an item up (bottom insertion)", () => {
    // Move 'e' (4) to 'b' (1) bottom -> insert after 'b'
    // new array: a, b, e, c, d
    const result = reorderSequence(letters, 4, 1, "bottom");
    expect(result).toEqual(["a", "b", "e", "c", "d"]);
  });

  it("handles move to same index (no-op)", () => {
    const result = reorderSequence(letters, 2, 2, "top");
    expect(result).toEqual(letters);
  });
});

describe("calculateDragPosition", () => {
  it("returns 'top' when cursor is in upper half", () => {
    const mockElement = {
      getBoundingClientRect: () => ({ top: 100, height: 100, bottom: 200 }),
    } as unknown as HTMLElement;

    const mockEvent = {
      clientY: 120, // 20px from top
    } as DragEvent;

    expect(calculateDragPosition(mockEvent, mockElement)).toBe("top");
  });

  it("returns 'bottom' when cursor is in lower half", () => {
    const mockElement = {
      getBoundingClientRect: () => ({ top: 100, height: 100, bottom: 200 }),
    } as unknown as HTMLElement;

    const mockEvent = {
      clientY: 180, // 80px from top (lower half)
    } as DragEvent;

    expect(calculateDragPosition(mockEvent, mockElement)).toBe("bottom");
  });
});

describe("getClosestTarget", () => {
  let container: HTMLElement;
  let children: HTMLElement[];

  beforeEach(() => {
    container = document.createElement("div");

    // Create 3 vertical items
    // Item 1: 0-50
    // Item 2: 50-100
    // Item 3: 100-150
    children = [0, 1, 2].map((i) => {
      const el = document.createElement("div");
      el.className = "item";
      // Mock getBoundingClientRect
      el.getBoundingClientRect = () =>
        ({
          top: i * 50,
          height: 50,
          bottom: (i + 1) * 50,
          left: 0,
          right: 100,
          width: 100,
        }) as DOMRect;
      container.appendChild(el);
      return el;
    });
  });

  it("finds closest element (middle item)", () => {
    // Mouse at 75 (center of Item 2)
    const mockEvent = { clientY: 75 } as DragEvent;
    const result = getClosestTarget(mockEvent, ".item", container);
    expect(result?.element).toBe(children[1]);
  });

  it("detects 'top' position on target", () => {
    // Mouse at 60 (top half of Item 2, which is 50-100)
    const mockEvent = { clientY: 60 } as DragEvent;
    const result = getClosestTarget(mockEvent, ".item", container);
    expect(result?.element).toBe(children[1]);
    expect(result?.position).toBe("top");
  });

  it("detects 'bottom' position on target", () => {
    // Mouse at 90 (bottom half of Item 2, which is 50-100)
    const mockEvent = { clientY: 90 } as DragEvent;
    const result = getClosestTarget(mockEvent, ".item", container);
    expect(result?.element).toBe(children[1]);
    expect(result?.position).toBe("bottom");
  });

  it("returns null if no elements match selector", () => {
    const mockEvent = { clientY: 50 } as DragEvent;
    const result = getClosestTarget(mockEvent, ".non-existent", container);
    expect(result).toBeNull();
  });
});
