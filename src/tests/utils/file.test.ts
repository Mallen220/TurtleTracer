// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { imageToBase64 } from "../../utils/file";

describe("file utils", () => {
  it("should convert image to base64", async () => {
    // Mock FileReader
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null as any,
      onerror: null as any,
      result: "data:image/png;base64,mockdata",
    };

    globalThis.FileReader = vi.fn(() => mockFileReader) as any;

    const file = new File(["mock"], "test.png", { type: "image/png" });

    const promise = imageToBase64(file);

    // Simulate onload
    mockFileReader.onload();

    const result = await promise;
    expect(mockFileReader.readAsDataURL).toHaveBeenCalledWith(file);
    expect(result).toBe("data:image/png;base64,mockdata");
  });

  it("should reject on error", async () => {
    const mockFileReader = {
      readAsDataURL: vi.fn(),
      onload: null as any,
      onerror: null as any,
      error: new Error("read fail"),
    };
    globalThis.FileReader = vi.fn(() => mockFileReader) as any;

    const file = new File(["mock"], "test.png", { type: "image/png" });
    const promise = imageToBase64(file);

    mockFileReader.onerror();

    await expect(promise).rejects.toThrow("read fail");
  });
});
