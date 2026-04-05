// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { getDisplayShortcut, matchShortcut } from "../../utils/shortcuts";

describe("shortcuts", () => {
  describe("matchShortcut", () => {
    const createEvent = (
      key: string,
      modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {}
    ): KeyboardEvent => {
      return {
        key,
        ctrlKey: !!modifiers.ctrl,
        shiftKey: !!modifiers.shift,
        altKey: !!modifiers.alt,
        metaKey: !!modifiers.meta,
      } as KeyboardEvent;
    };

    it("should return false for empty shortcut", () => {
      expect(matchShortcut(createEvent("a"), "")).toBe(false);
    });

    it("should match basic single keys", () => {
      expect(matchShortcut(createEvent("a"), "a")).toBe(true);
      expect(matchShortcut(createEvent("A"), "a")).toBe(true);
      expect(matchShortcut(createEvent("b"), "a")).toBe(false);
    });

    it("should match combinations with single modifier", () => {
      expect(matchShortcut(createEvent("s", { ctrl: true }), "ctrl+s")).toBe(true);
      // Missing modifier
      expect(matchShortcut(createEvent("s"), "ctrl+s")).toBe(false);
      // Extra modifier
      expect(matchShortcut(createEvent("s", { ctrl: true, shift: true }), "ctrl+s")).toBe(false);
    });

    it("should match combinations with multiple modifiers", () => {
      expect(matchShortcut(createEvent("a", { ctrl: true, shift: true }), "ctrl+shift+a")).toBe(true);
      // Missing one modifier
      expect(matchShortcut(createEvent("a", { ctrl: true }), "ctrl+shift+a")).toBe(false);
    });

    it("should support cmd/meta/command aliases", () => {
      expect(matchShortcut(createEvent("s", { meta: true }), "cmd+s")).toBe(true);
      expect(matchShortcut(createEvent("s", { meta: true }), "command+s")).toBe(true);
      expect(matchShortcut(createEvent("s", { meta: true }), "meta+s")).toBe(true);
    });

    it("should support multiple comma-separated options", () => {
      // Matches first option
      expect(matchShortcut(createEvent("s", { meta: true }), "cmd+s, ctrl+s")).toBe(true);
      // Matches second option
      expect(matchShortcut(createEvent("s", { ctrl: true }), "cmd+s, ctrl+s")).toBe(true);
      // Matches neither
      expect(matchShortcut(createEvent("s", { alt: true }), "cmd+s, ctrl+s")).toBe(false);
    });

    it("should normalize space key", () => {
      expect(matchShortcut(createEvent(" "), "space")).toBe(true);
      expect(matchShortcut(createEvent(" ", { ctrl: true }), "ctrl+space")).toBe(true);
    });

    it("should support other special keys", () => {
      expect(matchShortcut(createEvent("Escape"), "escape")).toBe(true);
      expect(matchShortcut(createEvent("Enter"), "enter")).toBe(true);
      expect(matchShortcut(createEvent("ArrowUp"), "arrowup")).toBe(true);
    });

    it("should handle mixed case definitions", () => {
      expect(matchShortcut(createEvent("s", { ctrl: true }), "Ctrl+S")).toBe(true);
    });
  });

  it("should return empty string if no bindings provided", () => {
    expect(getDisplayShortcut("actionId")).toBe("");
  });

  it("should return empty string if binding not found", () => {
    expect(
      getDisplayShortcut("actionId", [
        { id: "other", action: "other", key: "ctrl+s", description: "save" },
      ]),
    ).toBe("");
  });

  it("should format shortcuts for Windows/Linux correctly", () => {
    // mock userAgent to non-mac
    Object.defineProperty(navigator, "userAgent", {
      value: "Windows",
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: "Win32",
      configurable: true,
    });

    expect(
      getDisplayShortcut("save", [
        { id: "save", action: "save", key: "ctrl+s", description: "save" },
      ]),
    ).toBe("Ctrl + S");
    expect(
      getDisplayShortcut("save", [
        {
          id: "save",
          action: "save",
          key: "cmd+s, ctrl+s",
          description: "save",
        },
      ]),
    ).toBe("Ctrl + S");
  });

  it("should format shortcuts for Mac correctly", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mac OS X",
      configurable: true,
    });
    Object.defineProperty(navigator, "platform", {
      value: "MacIntel",
      configurable: true,
    });

    expect(
      getDisplayShortcut("save", [
        {
          id: "save",
          action: "save",
          key: "cmd+s, ctrl+s",
          description: "save",
        },
      ]),
    ).toBe("⌘ S");
    // shift
    expect(
      getDisplayShortcut("save", [
        { id: "save", action: "save", key: "cmd+shift+s", description: "save" },
      ]),
    ).toBe("⌘ Shift S");
  });
});
