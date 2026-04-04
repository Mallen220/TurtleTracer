// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { getDisplayShortcut } from "../../utils/shortcuts";

describe("shortcuts", () => {
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
