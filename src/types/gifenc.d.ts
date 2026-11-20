// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
declare module "gifenc" {
  export type Palette = number[][];
  export function GIFEncoder(): {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: { palette?: Palette; delay?: number; repeat?: number },
    ): void;
    finish(): void;
    bytesView(): Uint8Array<ArrayBuffer>;
  };
  export function quantize(
    rgba: Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: "rgb565" | "rgb444" | "rgba4444" },
  ): Palette;
  export function applyPalette(
    rgba: Uint8ClampedArray,
    palette: Palette,
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array;
}
