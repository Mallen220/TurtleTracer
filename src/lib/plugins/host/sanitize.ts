// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The two things from plugins that end up in the app's own page: SVG icons
// and theme CSS. Both are cleaned first.
import DOMPurify from "dompurify";

/** An SVG icon with scripts, event handlers and foreign content removed. */
export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

/** Theme CSS is limited to this size. */
export const MAX_THEME_CSS = 500_000;

/**
 * Theme CSS without `@import` or `url()`s that point anywhere: a theme can
 * restyle the app but can't make it load anything. Inline `data:` images
 * are kept.
 */
export function sanitizeCss(css: string): string {
  return css
    .slice(0, MAX_THEME_CSS)
    .replaceAll(/@import[^;]*;?/gi, "")
    .replaceAll(
      /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (match, _quote: string, target: string) =>
        target.trim().toLowerCase().startsWith("data:") ? match : "none",
    );
}
