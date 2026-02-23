// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TEMPLATE,
  isNewestTemplate,
} from "../lib/components/whats-new/features/index";

describe("WhatsNew Template Check", () => {
  it("should have the correct default template structure", () => {
    expect(DEFAULT_TEMPLATE).toContain("### What's New!");
    expect(DEFAULT_TEMPLATE).toContain("## **Features:**");
    expect(DEFAULT_TEMPLATE).toContain("## **Bug Fixes:**");
  });

  it("should identify exact template match as template", () => {
    expect(isNewestTemplate(DEFAULT_TEMPLATE)).toBe(true);
  });

  it("should identify trimmed template match as template", () => {
    const padded = `

    ${DEFAULT_TEMPLATE}

    `;
    expect(isNewestTemplate(padded)).toBe(true);
  });

  it("should identify modified content as NOT template", () => {
    const modified = DEFAULT_TEMPLATE + "\n- New feature";
    expect(isNewestTemplate(modified)).toBe(false);
  });

  it("should identify content with comments as NOT template (strict check)", () => {
    const commented = DEFAULT_TEMPLATE + "\n<!-- No changes -->";
    expect(isNewestTemplate(commented)).toBe(false);
  });
});
