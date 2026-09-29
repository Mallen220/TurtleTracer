// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushSync } from "svelte";
import { FieldLayout } from "./fieldLayout.svelte";

// Rune effects only run inside a root or component, so each layout is created
// in a root that is torn down after the test.
let stopEffects: (() => void) | undefined;

function createLayout() {
  let layout!: FieldLayout;
  const presentation = $state({ on: false });
  stopEffects = $effect.root(() => {
    layout = new FieldLayout(() => presentation.on);
  });
  return { layout, presentation };
}

/** A layout on a 1400x900 window whose main area is 1000x600. */
function wideLayout() {
  const made = createLayout();
  made.layout.innerWidth = 1400;
  made.layout.mainContentWidth = 1000;
  made.layout.mainContentHeight = 600;
  flushSync();
  return made;
}

/** A layout on a 800px-wide (phone or narrow window) screen. */
function narrowLayout() {
  const made = createLayout();
  made.layout.innerWidth = 800;
  made.layout.mainContentWidth = 800;
  made.layout.mainContentHeight = 500;
  flushSync();
  return made;
}

function key(name: string, shiftKey = false) {
  return {
    key: name,
    shiftKey,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

function stubMainContentRect(layout: FieldLayout, top: number, height: number) {
  layout.mainContentDiv = {
    getBoundingClientRect: () => ({ top, height }),
  } as unknown as HTMLDivElement;
}

describe("FieldLayout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopEffects?.();
    stopEffects = undefined;
    vi.useRealTimers();
  });

  describe("wide screens", () => {
    it("starts with the field taking about half the width", () => {
      const { layout } = wideLayout();
      expect(layout.isLargeScreen).toBe(true);
      expect(layout.userFieldLimit).toBe(490);
      expect(layout.leftPaneWidth).toBe(490);
      expect(layout.fieldContainerWidth).toBe("490px");
      expect(layout.fieldContainerHeight).toBe("100%");
    });

    it("draws the field as the largest square that fits", () => {
      const { layout } = wideLayout();
      // Pane is 490 wide (474 usable) and 600 tall (584 usable).
      expect(layout.fieldDrawSize).toBe(474);
      layout.userFieldLimit = 680;
      expect(layout.fieldDrawSize).toBe(584);
    });

    it("keeps the control tab wide enough when the field is dragged too far", () => {
      const { layout } = wideLayout();
      layout.userFieldLimit = 990;
      expect(layout.leftPaneWidth).toBe(1000 - 320);
      layout.userFieldLimit = 10;
      expect(layout.leftPaneWidth).toBe(300);
    });

    it("splits evenly when there is no room for both minimums", () => {
      const { layout } = wideLayout();
      layout.mainContentWidth = 600;
      flushSync();
      expect(layout.leftPaneWidth).toBe(300);
    });

    it("gives the field everything when the sidebar is hidden", () => {
      const { layout } = wideLayout();
      layout.showSidebar = false;
      expect(layout.effectiveShowSidebar).toBe(false);
      expect(layout.leftPaneWidth).toBe(1000);
      expect(layout.fieldContainerWidth).toBe("100%");
    });
  });

  describe("narrow screens", () => {
    it("starts with the field taking 60% of the height", () => {
      const { layout } = narrowLayout();
      expect(layout.isLargeScreen).toBe(false);
      expect(layout.userFieldHeightLimit).toBe(300);
      expect(layout.fieldContainerHeight).toBe("300px");
      expect(layout.fieldDrawSize).toBe(284);
    });

    it("never draws the field wider than the window", () => {
      const { layout } = narrowLayout();
      layout.userFieldHeightLimit = 5000;
      expect(layout.fieldDrawSize).toBe(800 - 32);
    });

    it("uses all the height when the sidebar is hidden", () => {
      const { layout } = narrowLayout();
      layout.showSidebar = false;
      expect(layout.fieldContainerHeight).toBe("500px");
    });

    it("removes the closed control tab after it has slid out", () => {
      const { layout } = narrowLayout();
      layout.showSidebar = false;
      flushSync();
      expect(layout.controlTabHidden).toBe(false);

      vi.advanceTimersByTime(319);
      expect(layout.controlTabHidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(layout.controlTabHidden).toBe(true);

      layout.showSidebar = true;
      flushSync();
      expect(layout.controlTabHidden).toBe(false);
    });

    it("never hides the control tab on wide screens", () => {
      const { layout } = wideLayout();
      layout.showSidebar = false;
      flushSync();
      vi.advanceTimersByTime(1000);
      expect(layout.controlTabHidden).toBe(false);
    });
  });

  describe("presentation mode", () => {
    it("hides the sidebar and lets the field fill the area", () => {
      const { layout, presentation } = wideLayout();
      presentation.on = true;
      flushSync();
      expect(layout.effectiveShowSidebar).toBe(false);
      expect(layout.fieldRenderWidth).toBe(1000);
      expect(layout.fieldRenderHeight).toBe(600);
    });
  });

  describe("dragging the divider", () => {
    it("moves the field's edge with the mouse on wide screens", () => {
      const { layout } = wideLayout();
      layout.startResize("horizontal");
      const move = { preventDefault: vi.fn(), clientX: 600, clientY: 0 };
      layout.handleMouseMove(move as unknown as MouseEvent);
      expect(layout.userFieldLimit).toBe(600);
      expect(move.preventDefault).toHaveBeenCalled();
    });

    it("ignores mouse movement when no drag has started", () => {
      const { layout } = wideLayout();
      const move = { preventDefault: vi.fn(), clientX: 600, clientY: 0 };
      layout.handleMouseMove(move as unknown as MouseEvent);
      expect(layout.userFieldLimit).toBe(490);
      expect(move.preventDefault).not.toHaveBeenCalled();
    });

    it("stops dragging on release", () => {
      const { layout } = wideLayout();
      layout.startResize("horizontal");
      layout.stopResize();
      layout.handleMouseMove({
        preventDefault: vi.fn(),
        clientX: 700,
        clientY: 0,
      } as unknown as MouseEvent);
      expect(layout.userFieldLimit).toBe(490);
    });

    it("only starts the divider that exists in the current layout", () => {
      const wide = wideLayout();
      wide.layout.startResize("vertical");
      expect(wide.layout.resizeMode).toBeNull();
      wide.layout.startResize("horizontal");
      expect(wide.layout.resizeMode).toBe("horizontal");
      stopEffects?.();

      const narrow = narrowLayout();
      narrow.layout.startResize("horizontal");
      expect(narrow.layout.resizeMode).toBeNull();
      narrow.layout.startResize("vertical");
      expect(narrow.layout.resizeMode).toBe("vertical");
    });

    it("has no divider when the sidebar is hidden", () => {
      const { layout } = wideLayout();
      layout.showSidebar = false;
      layout.startResize("horizontal");
      expect(layout.resizeMode).toBeNull();
    });

    it("moves the field's bottom edge with touch, within limits", () => {
      const { layout } = narrowLayout();
      stubMainContentRect(layout, 100, 600);
      layout.startResize("vertical");
      const touch = (y: number) =>
        ({ touches: [{ clientX: 0, clientY: y }] }) as unknown as TouchEvent;

      layout.handleTouchMove(touch(400));
      expect(layout.userFieldHeightLimit).toBe(300);
      layout.handleTouchMove(touch(120));
      expect(layout.userFieldHeightLimit).toBe(200);
      layout.handleTouchMove(touch(900));
      expect(layout.userFieldHeightLimit).toBe(500);
    });
  });

  describe("keyboard resizing", () => {
    it("steps the field width with the arrow keys and Shift for bigger steps", () => {
      const { layout } = wideLayout();
      const right = key("ArrowRight");
      layout.resizeWithKeyboard(right, "horizontal");
      expect(layout.userFieldLimit).toBe(500);
      expect(right.preventDefault).toHaveBeenCalled();

      layout.resizeWithKeyboard(key("ArrowLeft", true), "horizontal");
      expect(layout.userFieldLimit).toBe(450);
    });

    it("stops at the minimum field width and the control tab's minimum", () => {
      const { layout } = wideLayout();
      layout.userFieldLimit = 305;
      layout.resizeWithKeyboard(key("ArrowLeft", true), "horizontal");
      expect(layout.userFieldLimit).toBe(300);

      layout.userFieldLimit = 675;
      layout.resizeWithKeyboard(key("ArrowRight", true), "horizontal");
      expect(layout.userFieldLimit).toBe(680);
    });

    it("leaves other keys alone", () => {
      const { layout } = wideLayout();
      const other = key("Enter");
      layout.resizeWithKeyboard(other, "horizontal");
      layout.resizeWithKeyboard(key("ArrowLeft"), "vertical");
      expect(layout.userFieldLimit).toBe(490);
      expect(other.preventDefault).not.toHaveBeenCalled();
    });

    it("moves the vertical divider with up and down", () => {
      const { layout } = narrowLayout();
      stubMainContentRect(layout, 0, 600);
      layout.resizeWithKeyboard(key("ArrowDown"), "vertical");
      expect(layout.userFieldHeightLimit).toBe(310);
      layout.resizeWithKeyboard(key("ArrowUp", true), "vertical");
      expect(layout.userFieldHeightLimit).toBe(260);
    });

    it("keeps room for the control tab below the field", () => {
      const { layout } = narrowLayout();
      stubMainContentRect(layout, 0, 600);
      layout.userFieldHeightLimit = 495;
      layout.resizeWithKeyboard(key("ArrowDown", true), "vertical");
      expect(layout.userFieldHeightLimit).toBe(500);
    });

    it("double-click puts the divider back to its default", () => {
      const { layout } = wideLayout();
      layout.resetFieldWidth();
      expect(layout.userFieldLimit).toBeNull();
      flushSync();
      expect(layout.userFieldLimit).toBe(490);
    });
  });
});
