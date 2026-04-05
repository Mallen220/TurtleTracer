// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { formatShortcut } from "../../utils/shortcutFormatter";

describe("formatShortcut", () => {
  it("should return empty string if shortcut is empty", () => {
    expect(formatShortcut("")).toBe("");
  });

  describe("macOS formatting", () => {
    it("should map modifier keys correctly for Mac", () => {
      expect(formatShortcut("cmd+s", true)).toBe("⌘S");
      expect(formatShortcut("shift+s", true)).toBe("⇧S");
      expect(formatShortcut("alt+s", true)).toBe("⌥S");
      expect(formatShortcut("ctrl+s", true)).toBe("⌃S");
      expect(formatShortcut("cmd+shift+p", true)).toBe("⌘⇧P");
    });

    it("should handle special keys with capitalization", () => {
      expect(formatShortcut("cmd+up", true)).toBe("⌘Up");
      expect(formatShortcut("alt+space", true)).toBe("⌥Space");
      expect(formatShortcut("shift+enter", true)).toBe("⇧Enter");
    });

    it("should format string without plus symbols", () => {
      expect(formatShortcut("cmd+shift+alt+ctrl+x", true)).toBe("⌘⇧⌥⌃X");
    });
  });

  describe("Windows/Linux formatting", () => {
    it("should map modifier keys correctly for non-Mac", () => {
      expect(formatShortcut("cmd+s", false)).toBe("Ctrl+S");
      expect(formatShortcut("shift+s", false)).toBe("Shift+S");
      expect(formatShortcut("alt+s", false)).toBe("Alt+S");
      expect(formatShortcut("ctrl+s", false)).toBe("Ctrl+S");
      expect(formatShortcut("ctrl+shift+p", false)).toBe("Ctrl+Shift+P");
    });

    it("should handle special keys with capitalization", () => {
      expect(formatShortcut("ctrl+up", false)).toBe("Ctrl+Up");
      expect(formatShortcut("alt+space", false)).toBe("Alt+Space");
      expect(formatShortcut("shift+enter", false)).toBe("Shift+Enter");
    });

    it("should format string with plus symbols", () => {
      expect(formatShortcut("ctrl+shift+alt+x", false)).toBe("Ctrl+Shift+Alt+X");
    });
  });
});
