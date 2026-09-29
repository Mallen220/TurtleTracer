// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Sizes and positions the field and control tab, including the draggable
// divider between them. On wide screens they sit side by side; on narrow
// screens the control tab goes below the field.
import * as d3 from "d3";
import { FIELD_SIZE } from "../config";

const LARGE_SCREEN_MIN_WIDTH = 1024;
const MIN_SIDEBAR_WIDTH = 320;
const MIN_FIELD_PANE_WIDTH = 300;
const MIN_FIELD_HEIGHT = 200;
/** Space kept for the control tab below the field on narrow screens. */
const MIN_CONTROL_TAB_HEIGHT = 100;
/** Matches the control tab's 300ms slide-out transition. */
const SLIDE_OUT_MS = 320;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

type ResizeMode = "horizontal" | "vertical";

export class FieldLayout {
  // Measured from the DOM (bound in the template).
  innerWidth = $state(0);
  mainContentWidth = $state(0);
  mainContentHeight = $state(0);
  mainContentDiv: HTMLDivElement | undefined = $state();
  controlTabContainer: HTMLDivElement | null = $state(null);
  controlTabRect = $state({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    right: 0,
    bottom: 0,
  });

  /** The user's chosen sidebar visibility (presentation mode overrides it). */
  showSidebar = $state(true);
  /** Field width (wide screens) or height (narrow screens) picked by dragging; null means default. */
  userFieldLimit: number | null = $state(null);
  userFieldHeightLimit: number | null = $state(null);
  resizeMode: ResizeMode | null = $state(null);
  /**
   * On narrow screens the closed control tab is removed from the layout once
   * its slide-out has finished, so the field can use the space.
   */
  controlTabHidden = $state(false);

  #isPresentation: () => boolean;

  constructor(isPresentation: () => boolean) {
    this.#isPresentation = isPresentation;

    $effect(() => {
      const container = this.controlTabContainer;
      if (!container) return;
      const update = () => this.#measureControlTab(container);
      const observer = new ResizeObserver(update);
      observer.observe(container);
      window.addEventListener("resize", update);
      update();
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", update);
      };
    });

    // Start from a default split until the user drags the divider.
    $effect(() => {
      if (
        this.userFieldHeightLimit === null &&
        this.mainContentHeight > 0 &&
        !this.isLargeScreen
      ) {
        this.userFieldHeightLimit = this.mainContentHeight * 0.6;
      }
    });
    $effect(() => {
      if (
        this.userFieldLimit === null &&
        this.mainContentWidth > 0 &&
        this.isLargeScreen
      ) {
        this.userFieldLimit = this.mainContentWidth * 0.49;
      }
    });

    $effect(() => {
      if (this.isLargeScreen || this.effectiveShowSidebar) {
        this.controlTabHidden = false;
        return;
      }
      const id = setTimeout(() => (this.controlTabHidden = true), SLIDE_OUT_MS);
      return () => clearTimeout(id);
    });
  }

  #measureControlTab(el: HTMLElement) {
    const r = el.getBoundingClientRect();
    this.controlTabRect = {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom),
    };
  }

  isLargeScreen = $derived(this.innerWidth >= LARGE_SCREEN_MIN_WIDTH);

  effectiveShowSidebar = $derived.by(() =>
    this.#isPresentation() ? false : this.showSidebar,
  );

  /** Width of the field pane on wide screens. */
  leftPaneWidth = $derived.by(() => {
    if (!this.isLargeScreen || !this.effectiveShowSidebar) {
      return this.mainContentWidth;
    }
    const max = this.mainContentWidth - MIN_SIDEBAR_WIDTH;
    if (max < MIN_FIELD_PANE_WIDTH) return this.mainContentWidth * 0.5;
    const target = this.userFieldLimit ?? this.mainContentWidth * 0.55;
    return clamp(target, MIN_FIELD_PANE_WIDTH, max);
  });

  /** Side length in pixels of the square the field is drawn in. */
  fieldDrawSize = $derived.by(() => {
    if (!this.isLargeScreen) {
      const h = this.userFieldHeightLimit ?? this.mainContentHeight * 0.6;
      return Math.min(this.innerWidth - 32, h - 16);
    }
    const availableWidth = this.leftPaneWidth - 16;
    const availableHeight = this.mainContentHeight - 16;
    return Math.max(100, Math.min(availableWidth, availableHeight));
  });

  /** Field inches to pixels. */
  xScale = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([0, this.fieldDrawSize || FIELD_SIZE]),
  );
  yScale = $derived(
    d3
      .scaleLinear()
      .domain([0, FIELD_SIZE])
      .range([this.fieldDrawSize || FIELD_SIZE, 0]),
  );

  /** Presentation mode lets the field fill the whole area. */
  fieldRenderWidth = $derived.by(() =>
    this.#isPresentation() ? this.mainContentWidth : this.fieldDrawSize,
  );
  fieldRenderHeight = $derived.by(() =>
    this.#isPresentation() ? this.mainContentHeight : this.fieldDrawSize,
  );

  /** CSS height of the field container on narrow screens, so it animates as the sidebar opens and closes. */
  fieldContainerHeight = $derived.by(() => {
    if (this.isLargeScreen) return "100%";
    if (!this.effectiveShowSidebar) return `${this.mainContentHeight}px`;
    const h = this.userFieldHeightLimit ?? this.mainContentHeight * 0.6;
    return `${Math.max(120, Math.floor(Math.min(h, this.mainContentHeight)))}px`;
  });

  /** CSS width of the field container. */
  fieldContainerWidth = $derived(
    this.isLargeScreen && this.effectiveShowSidebar
      ? `${this.leftPaneWidth}px`
      : "100%",
  );

  /** CSS min-height of the field container. */
  fieldContainerMinHeight = $derived(
    this.isLargeScreen ? "0" : this.userFieldHeightLimit ? "0" : "60vh",
  );

  // --- Resizing ---

  /** The divider only exists in the layout that matches its direction. */
  #canResize(mode: ResizeMode) {
    if (!this.effectiveShowSidebar) return false;
    return mode === "horizontal" ? this.isLargeScreen : !this.isLargeScreen;
  }

  #clampFieldHeight(height: number) {
    const max =
      (this.mainContentDiv?.getBoundingClientRect().height ?? 0) -
      MIN_CONTROL_TAB_HEIGHT;
    return Math.max(MIN_FIELD_HEIGHT, Math.min(height, max));
  }

  startResize(mode: ResizeMode) {
    if (this.#canResize(mode)) this.resizeMode = mode;
  }

  stopResize = () => {
    this.resizeMode = null;
  };

  /** Moves the divider to the pointer at (`clientX`, `clientY`) while dragging. */
  #dragTo(clientX: number, clientY: number) {
    if (this.resizeMode === "horizontal") {
      this.userFieldLimit = clientX;
    } else if (this.resizeMode === "vertical" && this.mainContentDiv) {
      const top = this.mainContentDiv.getBoundingClientRect().top;
      this.userFieldHeightLimit = this.#clampFieldHeight(clientY - top);
    }
  }

  handleMouseMove = (e: MouseEvent) => {
    if (!this.resizeMode) return;
    e.preventDefault();
    this.#dragTo(e.clientX, e.clientY);
  };

  handleTouchMove = (e: TouchEvent) => {
    if (!this.resizeMode) return;
    const touch = e.touches[0];
    this.#dragTo(touch.clientX, touch.clientY);
  };

  /** Arrow keys move the divider; Shift moves it further. */
  resizeWithKeyboard(e: KeyboardEvent, mode: ResizeMode) {
    const step = e.shiftKey ? 50 : 10;

    if (mode === "horizontal") {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const current = this.userFieldLimit ?? this.mainContentWidth * 0.55;
      this.userFieldLimit = clamp(
        current + (e.key === "ArrowLeft" ? -step : step),
        MIN_FIELD_PANE_WIDTH,
        this.mainContentWidth - MIN_SIDEBAR_WIDTH,
      );
    } else {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      // Up pulls the divider up (shorter field), down pulls it down.
      const current = this.userFieldHeightLimit ?? this.mainContentHeight * 0.6;
      this.userFieldHeightLimit = this.#clampFieldHeight(
        current + (e.key === "ArrowUp" ? -step : step),
      );
    }
  }

  resetFieldWidth() {
    this.userFieldLimit = null;
  }

  resetFieldHeight() {
    this.userFieldHeightLimit = null;
  }
}
