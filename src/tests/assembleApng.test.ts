// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import UPNG from "upng-js";
import { assembleApng, buildApng } from "../utils/exportAnimation";

// 16 x 12 frames: a moving block on a gradient, with a see-through corner
function frames(count: number) {
  return Array.from({ length: count }, (_, f) => {
    const data = new Uint8Array(16 * 12 * 4);
    for (let y = 0; y < 12; y++) {
      for (let x = 0; x < 16; x++) {
        const i = (y * 16 + x) * 4;
        const block = x >= f * 2 && x < f * 2 + 4 && y > 3 && y < 9;
        data.set(
          block ? [255, 0, 0, 255] : [x * 10, y * 15, 120, x + y > 2 ? 255 : 0],
          i,
        );
      }
    }
    return data.buffer;
  });
}

describe("assembleApng", () => {
  it("writes the same file as upng-js's own encode()", async () => {
    const delays = [40, 40, 60, 40, 20];
    const blob = await assembleApng(UPNG as any, frames(5), 16, 12, delays);
    const expected = new Uint8Array(UPNG.encode(frames(5), 16, 12, 0, delays));
    expect(blob.type).toBe("image/png");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(expected);
  });

  it("decodes back to the frames it was given", async () => {
    const input = frames(4);
    const blob = await assembleApng(
      UPNG as any,
      input,
      16,
      12,
      [50, 50, 50, 50],
    );
    const decoded = UPNG.decode(await blob.arrayBuffer());
    expect(decoded.frames).toHaveLength(4);
    const out = UPNG.toRGBA8(decoded);
    out.forEach((frame, i) =>
      expect(new Uint8Array(frame)).toEqual(new Uint8Array(input[i])),
    );
  });

  it("reduces to a palette PNG when asked, and keeps every frame", async () => {
    // 40 x 40 with well over 255 colors in each frame
    const input = Array.from({ length: 3 }, (_, f) => {
      const data = new Uint8Array(40 * 40 * 4);
      for (let i = 0; i < 1600; i++) {
        data.set(
          [(i * 7 + f * 40) % 256, (i * 13) % 256, (i * 29) % 256, 255],
          i * 4,
        );
      }
      return data.buffer;
    });
    const blob = await buildApng(input, 40, 40, [50, 50, 50], true);
    const decoded = UPNG.decode(await blob.arrayBuffer());
    expect(decoded.ctype).toBe(3); // palette, so about a third of the size
    expect(decoded.frames).toHaveLength(3);
    const colors = new Set<number>();
    for (const frame of UPNG.toRGBA8(decoded)) {
      const px = new Uint32Array(frame);
      px.forEach((c) => colors.add(c));
    }
    expect(colors.size).toBeLessThanOrEqual(256);
  });
});
