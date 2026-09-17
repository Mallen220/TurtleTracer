// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildActionHandlers,
  type ShortcutActionContext,
} from "./shortcutActions";

describe("shortcutActions", () => {
  let mockCtx: ShortcutActionContext;
  let activeTab: "path" | "field" | "table" | "code" = "path";
  let isPaletteOpen = false;

  beforeEach(() => {
    activeTab = "path";
    isPaletteOpen = false;
    mockCtx = {
      saveProject: vi.fn(),
      resetProject: vi.fn(),
      saveFileAs: vi.fn(),
      exportGif: vi.fn(),
      exportImage: vi.fn(),
      undoAction: vi.fn(),
      redoAction: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      resetAnimation: vi.fn(),
      stepForward: vi.fn(),
      stepBackward: vi.fn(),
      splitPath: vi.fn(),
      recordChange: vi.fn(),
      controlTabRef: {
        openAndStartOptimization: vi.fn(),
        stopOptimization: vi.fn(),
        applyOptimization: vi.fn(),
        discardOptimization: vi.fn(),
        retryOptimization: vi.fn(),
        copyCode: vi.fn(),
        copyTable: vi.fn(),
        downloadJava: vi.fn(),
      },
      getActiveControlTab: () => activeTab,
      setActiveControlTab: (t) => {
        activeTab = t;
      },
      toggleStats: vi.fn(),
      toggleSidebar: vi.fn(),
      toggleControlTab: vi.fn(),
      fieldRenderer: null,
      openWhatsNew: vi.fn(),
      toggleCommandPalette: vi.fn(() => {
        isPaletteOpen = !isPaletteOpen;
      }),
      closeCommandPalette: vi.fn(() => {
        isPaletteOpen = false;
      }),
      isCommandPaletteOpen: () => isPaletteOpen,
      openFileInput: vi.fn(),
      fetchFiles: vi.fn(),
      isPlaying: () => false,
    };
  });

  it("builds a full set of action handlers", () => {
    const handlers = buildActionHandlers(mockCtx);
    expect(handlers).toBeDefined();
    expect(typeof handlers.saveProject).toBe("function");
    expect(typeof handlers.togglePlay).toBe("function");
    expect(typeof handlers.undo).toBe("function");
    expect(typeof handlers.redo).toBe("function");
  });

  it("triggers context callbacks when actions are invoked", () => {
    const handlers = buildActionHandlers(mockCtx);
    handlers.saveProject();
    expect(mockCtx.saveProject).toHaveBeenCalled();

    handlers.undo();
    expect(mockCtx.undoAction).toHaveBeenCalled();

    handlers.redo();
    expect(mockCtx.redoAction).toHaveBeenCalled();

    handlers.togglePlay();
    expect(mockCtx.play).toHaveBeenCalled();
  });

  it("cycles control tabs correctly", () => {
    const handlers = buildActionHandlers(mockCtx);
    expect(mockCtx.getActiveControlTab()).toBe("path");
    handlers.cycleTabNext();
    expect(mockCtx.getActiveControlTab()).toBe("field");
    handlers.cycleTabNext();
    expect(mockCtx.getActiveControlTab()).toBe("table");
    handlers.cycleTabNext();
    expect(mockCtx.getActiveControlTab()).toBe("code");
    handlers.cycleTabNext();
    expect(mockCtx.getActiveControlTab()).toBe("path");
  });

  it("handles command palette toggle and close", () => {
    const handlers = buildActionHandlers(mockCtx);
    handlers.toggleCommandPalette();
    expect(mockCtx.toggleCommandPalette).toHaveBeenCalled();
    expect(mockCtx.isCommandPaletteOpen()).toBe(true);

    handlers.deselectAll();
    expect(mockCtx.closeCommandPalette).toHaveBeenCalled();
    expect(mockCtx.isCommandPaletteOpen()).toBe(false);
  });
});
