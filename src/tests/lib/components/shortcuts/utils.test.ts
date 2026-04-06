// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isInputFocused,
  isButtonFocused,
  shouldBlockShortcut,
  getSelectedSequenceIndex,
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
      expect(
        !!shouldBlockShortcut({} as KeyboardEvent, "save-project"),
      ).toBe(false);
      expect(
        !!shouldBlockShortcut({} as KeyboardEvent, "undo"),
      ).toBe(false);
    });
  });
});
