// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateName,
  copy,
} from "../../../../lib/components/shortcuts/clipboard";
import * as utils from "../../../../lib/components/shortcuts/utils";

vi.mock("../../../../lib/components/shortcuts/utils", () => ({
  isUIElementFocused: vi.fn(() => false),
  getSelectedSequenceIndex: vi.fn(() => 0),
}));

describe("clipboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateName", () => {
    it("should append 'duplicate' to base name", () => {
      expect(generateName("Test", [])).toBe("Test duplicate");
    });

    it("should increment duplicate number if it already exists", () => {
      expect(generateName("Test duplicate", ["Test duplicate"])).toBe(
        "Test duplicate 2",
      );
      expect(
        generateName("Test duplicate", ["Test duplicate", "Test duplicate 2"]),
      ).toBe("Test duplicate 3");
    });
  });

  describe("copy", () => {
    it("should do nothing if UI element is focused", () => {
      vi.mocked(utils.isUIElementFocused).mockReturnValue(true);
      copy("table", null);
      // Test will pass if no crash occurs
    });
  });
});
