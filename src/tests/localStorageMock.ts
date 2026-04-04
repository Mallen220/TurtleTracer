// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { vi } from "vitest";

export function setupLocalStorageMock() {
  const storage: Record<string, string> = {};
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        storage[key] = value;
      }),
      clear: vi.fn(() => {
        for (const key in storage) delete storage[key];
      }),
      removeItem: vi.fn((key: string) => {
        delete storage[key];
      }),
    },
    writable: true,
  });
}
