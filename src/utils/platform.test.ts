// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("platform", () => {
  let originalNavigatorPlatform: any;
  let originalNavigatorUserAgent: any;
  let originalProcessPlatform: any;

  beforeEach(() => {
    originalNavigatorPlatform = globalThis.navigator?.platform;
    originalNavigatorUserAgent = globalThis.navigator?.userAgent;
    originalProcessPlatform = globalThis.process?.platform;
    vi.resetModules();
  });

  afterEach(() => {
    if (globalThis.navigator) {
      Object.defineProperty(globalThis.navigator, "platform", {
        value: originalNavigatorPlatform,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(globalThis.navigator, "userAgent", {
        value: originalNavigatorUserAgent,
        writable: true,
        configurable: true,
      });
    }

    if (globalThis.process) {
      Object.defineProperty(globalThis.process, "platform", {
        value: originalProcessPlatform,
        writable: true,
        configurable: true,
      });
    }
    vi.resetModules();
  });

  it("detects Mac correctly", async () => {
    Object.defineProperty(globalThis.navigator, "platform", {
      value: "MacIntel",
      writable: true,
      configurable: true,
    });
    const { isMac, modKey, altKey } = await import("./platform");
    expect(isMac).toBe(true);
    expect(modKey).toBe("Cmd");
    expect(altKey).toBe("Opt");
  });

  it("detects Windows correctly", async () => {
    Object.defineProperty(globalThis.navigator, "platform", {
      value: "Win32",
      writable: true,
      configurable: true,
    });
    const { isMac, modKey, altKey } = await import("./platform");
    expect(isMac).toBe(false);
    expect(modKey).toBe("Ctrl");
    expect(altKey).toBe("Alt");
  });

  it("detects browser correctly", async () => {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      value: "Mozilla/5.0",
      writable: true,
      configurable: true,
    });
    const { isBrowser } = await import("./platform");
    expect(isBrowser).toBe(true);
  });

  it("detects electron correctly", async () => {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      value: "Electron/12.0.0",
      writable: true,
      configurable: true,
    });
    const { isBrowser } = await import("./platform");
    expect(isBrowser).toBe(false);
  });

  it("returns process.platform if available", async () => {
    Object.defineProperty(globalThis.process, "platform", {
      value: "linux",
      writable: true,
      configurable: true,
    });
    const { platform } = await import("./platform");
    expect(platform()).toBe("linux");
  });

  it("returns navigator.platform if process.platform is not available", async () => {
    Object.defineProperty(globalThis.process, "platform", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, "platform", {
      value: "Win32",
      writable: true,
      configurable: true,
    });
    const { platform } = await import("./platform");
    expect(platform()).toBe("Win32");
  });

  it("returns unknown if neither is available", async () => {
    Object.defineProperty(globalThis.process, "platform", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis.navigator, "platform", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    const { platform } = await import("./platform");
    expect(platform()).toBe("unknown");
  });
});
