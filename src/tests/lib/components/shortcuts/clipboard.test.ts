// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  copy,
  clipboard,
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

  describe("copy", () => {
    it("does nothing while a UI element is focused", () => {
      vi.mocked(utils.isUIElementFocused).mockReturnValue(true);
      const copyTable = vi.fn();
      copy("table", { copyTable });
      expect(copyTable).not.toHaveBeenCalled();
      expect(clipboard).toBeNull();
    });
  });
});
