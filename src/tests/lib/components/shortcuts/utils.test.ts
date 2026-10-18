// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import {
  isInputFocused,
  isButtonFocused,
  shouldBlockShortcut,
} from "../../../../lib/components/shortcuts/utils";

describe("shortcuts utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isInputFocused", () => {
    it("should return false if activeElement is null or not input", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("div"),
      );
      expect(!!isInputFocused()).toBe(false);
    });

    it("should return true if activeElement is input", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("input"),
      );
      expect(!!isInputFocused()).toBe(true);
    });
  });

  describe("isButtonFocused", () => {
    it("should return true if activeElement is button", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("button"),
      );
      expect(!!isButtonFocused()).toBe(true);
    });
  });

  describe("shouldBlockShortcut", () => {
    it("should not block if input is not focused", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("div"),
      );
      expect(!!shouldBlockShortcut({} as KeyboardEvent, "some-action")).toBe(
        false,
      );
    });

    it("should block if input is focused and action is not whitelisted", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("input"),
      );
      expect(!!shouldBlockShortcut({} as KeyboardEvent, "some-action")).toBe(
        true,
      );
    });

    it("should not block if input is focused but action is whitelisted", () => {
      vi.spyOn(document, "activeElement", "get").mockReturnValue(
        document.createElement("input"),
      );
      expect(
        !!shouldBlockShortcut({} as KeyboardEvent, "toggle-command-palette"),
      ).toBe(false);
      expect(!!shouldBlockShortcut({} as KeyboardEvent, "save-project")).toBe(
        false,
      );

      const viewActions = [
        "zoom-in",
        "zoom-out",
        "zoom-reset",
        "pan-view-up",
        "pan-view-down",
        "pan-view-left",
        "pan-view-right",
      ];
      viewActions.forEach((action) => {
        expect(!!shouldBlockShortcut({} as KeyboardEvent, action)).toBe(false);
      });
    });
  });
});

import { registerCoreUI } from "../../../../lib/coreRegistrations";
import { sequenceStore } from "../../../../lib/projectStore";
import { selectedLineId, selectedPointId } from "../../../../stores";
import { getSelectedSequenceIndex } from "../../../../lib/components/shortcuts/utils";
import type { SequenceItem } from "../../../../types";

describe("shouldBlockShortcut in detail", () => {
  const focused = (tag: string, attrs: Record<string, string> = {}) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    vi.spyOn(document, "activeElement", "get").mockReturnValue(el);
  };
  const key = (k: string, mods: Partial<KeyboardEvent> = {}) =>
    ({ key: k, ...mods }) as KeyboardEvent;

  const ALLOWED_WHILE_TYPING = [
    "toggle-command-palette",
    "cycle-tabs-next",
    "cycle-tabs-prev",
    "select-code-tab",
    "select-paths-tab",
    "select-field-tab",
    "select-table-tab",
    "save-project",
    "save-file-as",
    "open-settings",
    "toggle-sidebar",
    "zoom-in",
    "zoom-out",
    "zoom-reset",
    "toggle-lock-view",
    "pan-view-up",
    "pan-view-down",
    "pan-view-left",
    "pan-view-right",
    "toggle-lock-field-view",
    "toggle-continuous-validation",
    "new-file",
    "open-file",
    "export-java",
    "export-points",
    "export-sequential",
    "export-pp",
    "export-gif",
    "export-image",
    "download-java",
    "copy-code",
    "copy-table",
    "docs",
    "focus-name",
    "confirm-dialog",
  ];

  it.each(ALLOWED_WHILE_TYPING)("lets %s through while typing", (action) => {
    focused("input");
    expect(shouldBlockShortcut(key("a"), action)).toBe(false);
  });

  it("blocks every other action while typing", () => {
    focused("textarea");
    expect(shouldBlockShortcut(key("a"), "delete-selection")).toBe(true);
    expect(shouldBlockShortcut(key("a"), undefined)).toBe(true);
    focused("input");
    expect(shouldBlockShortcut(key("a"), "")).toBe(true);
  });

  it("never blocks Escape", () => {
    focused("input");
    expect(shouldBlockShortcut(key("Escape"), "delete-selection")).toBe(false);
  });

  it("blocks Space and Enter on a focused button, unless a modifier is held", () => {
    focused("button");
    expect(shouldBlockShortcut(key(" "), "x")).toBe(true);
    expect(shouldBlockShortcut(key("Enter"), "x")).toBe(true);
    for (const mod of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) {
      expect(shouldBlockShortcut(key("Enter", { [mod]: true }), "x")).toBe(
        false,
      );
    }
    expect(shouldBlockShortcut(key("a"), "x")).toBe(false);
  });

  it("blocks nothing when nothing is focused", () => {
    focused("div");
    expect(shouldBlockShortcut(key("Enter"), "x")).toBe(false);
  });
});

describe("getSelectedSequenceIndex", () => {
  beforeAll(() => registerCoreUI());
  const sequence = [
    { kind: "path", lineId: "l1" },
    { kind: "wait", id: "w1", name: "", durationMs: 1 },
    { kind: "rotate", id: "r1", name: "", degrees: 1 },
    { kind: "path", lineId: "l2" },
  ] as SequenceItem[];

  beforeEach(() => {
    sequenceStore.set(sequence);
    selectedLineId.set(null);
    selectedPointId.set(null);
  });

  it("is null with nothing selected", () => {
    expect(getSelectedSequenceIndex()).toBeNull();
  });

  it("finds a selected wait or turn by id", () => {
    selectedPointId.set("wait-w1");
    expect(getSelectedSequenceIndex()).toBe(1);
    selectedPointId.set("rotate-r1");
    expect(getSelectedSequenceIndex()).toBe(2);
  });

  it("finds the path a selected point belongs to", () => {
    selectedPointId.set("point-2-1");
    selectedLineId.set("l2");
    expect(getSelectedSequenceIndex()).toBe(3);
  });

  it("is null for a point with no selected path, or for things it doesn't know", () => {
    selectedPointId.set("point-1-0");
    expect(getSelectedSequenceIndex()).toBeNull();
    selectedPointId.set("wait-missing");
    expect(getSelectedSequenceIndex()).toBeNull();
    selectedPointId.set("rotate-missing");
    expect(getSelectedSequenceIndex()).toBeNull();
    selectedPointId.set("obstacle-0-0");
    expect(getSelectedSequenceIndex()).toBeNull();
    selectedPointId.set("point-1-0");
    selectedLineId.set("nope");
    expect(getSelectedSequenceIndex()).toBeNull();
  });

  it("doesn't mistake a wait id for a turn's", () => {
    selectedPointId.set("rotate-w1");
    expect(getSelectedSequenceIndex()).toBeNull();
  });
});
