// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
const WHITE = "#ffffff";
const BLACK = "#000000";

function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
  if (!hex) return null;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function luminance([r, g, b]: [number, number, number]) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Black or white, whichever reads better on `background` (a hex color).
 * Anything that isn't a hex color gets white.
 */
export function readableTextOn(background: string): string {
  const rgb = parseColor(background);
  if (!rgb) return WHITE;
  const l = luminance(rgb);
  // Contrast with white is 1.05 / (l + .05); with black, (l + .05) / .05.
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? WHITE : BLACK;
}
