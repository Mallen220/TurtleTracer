// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config.js";
import { ui } from "../lib/ui";

/**
 * WCAG contrast for every colour pair the shared presets in ui.ts produce, in
 * light and dark mode, worked out from the real Tailwind palette:
 *  - text needs 4.5:1 (AA) against the background it sits on
 *  - focus rings need 3:1 (non-text contrast) against the page
 * A preset that names its own background is checked on that background; one
 * that doesn't (a link, a heading) is checked on every surface it can land on.
 */

type RGB = [number, number, number];
const palette = resolveConfig(tailwindConfig as never).theme.colors as Record<
  string,
  string | Record<string, string>
>;

function hexToRgb(hex: string): RGB {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as RGB;
}

function colour(name: string): RGB | null {
  if (name === "white") return [255, 255, 255];
  if (name === "black") return [0, 0, 0];
  const [family, shade] = [
    name.slice(0, name.lastIndexOf("-")),
    name.split("-").at(-1)!,
  ];
  const group = palette[family];
  if (!group || typeof group === "string" || !group[shade]) return null;
  return hexToRgb(group[shade]);
}

const blend = (top: RGB, under: RGB, alpha: number): RGB =>
  top.map((v, i) => v * alpha + under[i] * (1 - alpha)) as RGB;

function luminance([r, g, b]: RGB) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.039_28 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Surfaces a preset without a background of its own can end up on. */
const SURFACES = {
  light: ["white", "neutral-50", "neutral-100"].map((n) => colour(n)!),
  dark: ["neutral-800", "neutral-900"].map((n) => colour(n)!),
};

type Parsed = { variant: string; name: string; alpha: number };

/** "dark:hover:text-neutral-200/50" -> { variant: "dark:hover:", name: "neutral-200", alpha: .5 } */
function parse(token: string, utility: string): Parsed | null {
  const split = token.lastIndexOf(":");
  const variant = token.slice(0, split + 1);
  const rest = token.slice(split + 1);
  if (!rest.startsWith(`${utility}-`)) return null;
  const [name, alpha] = rest.slice(utility.length + 1).split("/");
  if (!colour(name)) return null;
  return { variant, name, alpha: alpha ? Number(alpha) / 100 : 1 };
}

const some = (tokens: string[], utility: string) =>
  tokens.map((t) => parse(t, utility)).filter((p): p is Parsed => p !== null);

function presets(): Record<string, string> {
  const all: Record<string, string> = {};
  for (const [name, value] of Object.entries(ui)) {
    if (typeof value === "string") all[name] = value;
    else if (typeof value === "object") {
      for (const [tone, classes] of Object.entries(value))
        all[`${name}.${tone}`] = classes as string;
    }
  }
  for (const active of [true, false]) {
    all[`tab(${active})`] = ui.tab(active);
    all[`tabUnderline(${active})`] = ui.tabUnderline(active);
    all[`navItem(${active})`] = ui.navItem(active);
    all[`choice(${active})`] = ui.choice(active);
    all[`row(${active})`] = ui.row(active);
  }
  for (const color of [
    "green",
    "amber",
    "pink",
    "purple",
    "teal",
    "blue",
    "red",
    "indigo",
    "gray",
  ]) {
    all[`kindBtn(${color})`] = ui.kindBtn(color);
    all[`kindChip(${color})`] = ui.kindChip(color);
  }
  return all;
}

function check(name: string, classes: string, mode: "light" | "dark") {
  const failures: string[] = [];
  const tokens = classes.split(" ");
  const inMode = (variant: string) =>
    mode === "dark" ? variant.startsWith("dark:") : !variant.includes("dark:");

  const withState = (state: string) => {
    const keep = (p: Parsed) =>
      inMode(p.variant) &&
      !/focus|disabled|active|group-|peer-/.test(p.variant) &&
      p.variant.replace("dark:", "") === state;
    return {
      text: some(tokens, "text").findLast(keep),
      bg: some(tokens, "bg").findLast(keep),
    };
  };

  const base = withState("");
  const hover = withState("hover:");
  const surfaces = SURFACES[mode];

  const test = (label: string, fg: Parsed | undefined, bgs: RGB[]) => {
    if (!fg) return;
    for (const bg of bgs) {
      const text =
        fg.alpha < 1 ? blend(colour(fg.name)!, bg, fg.alpha) : colour(fg.name)!;
      const ratio = contrast(text, bg);
      if (ratio < 4.5)
        failures.push(
          `${name} [${mode}] ${label}: ${fg.name} on ${bg} is ${ratio.toFixed(2)}:1`,
        );
    }
  };

  const ownBg = (p?: Parsed): RGB[] | null => {
    if (!p) return null;
    const c = colour(p.name)!;
    return (
      p.alpha < 1 ? surfaces.map((s) => blend(c, s, p.alpha)) : [c]
    ) as RGB[];
  };

  test("text", base.text, ownBg(base.bg) ?? surfaces);
  // On hover the text may change, the background may change, or both.
  if (hover.text || hover.bg) {
    test(
      "hover text",
      hover.text ?? base.text,
      ownBg(hover.bg) ?? ownBg(base.bg) ?? surfaces,
    );
  }
  return failures;
}

function focusRing(name: string, classes: string, mode: "light" | "dark") {
  const failures: string[] = [];
  for (const token of classes.split(" ")) {
    const m = /^(dark:)?focus-visible:ring-([a-z]+-\d+)$/.exec(token);
    if (!m) continue;
    if ((mode === "dark") !== Boolean(m[1])) continue;
    const ring = colour(m[2])!;
    for (const surface of SURFACES[mode]) {
      const ratio = contrast(ring, surface);
      if (ratio < 3)
        failures.push(
          `${name} [${mode}] focus ring ${m[2]} on ${surface} is ${ratio.toFixed(2)}:1 (needs 3)`,
        );
    }
  }
  return failures;
}

describe("ui presets meet WCAG contrast", () => {
  const all = presets();

  for (const mode of ["light", "dark"] as const) {
    it(`has readable text in ${mode} mode`, () => {
      const failures = Object.entries(all).flatMap(([name, classes]) =>
        check(name, classes, mode),
      );
      expect(failures).toEqual([]);
    });

    it(`has focus rings you can see in ${mode} mode`, () => {
      const failures = Object.entries(all).flatMap(([name, classes]) =>
        focusRing(name, classes, mode),
      );
      expect(failures).toEqual([]);
    });
  }

  it("actually looked at something", () => {
    // Guards against the parser silently matching nothing.
    const checked = Object.values(all).filter((c) =>
      /text-[a-z]+-\d+/.test(c),
    ).length;
    expect(checked).toBeGreaterThan(40);
    expect(contrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 0);
    expect(contrast(colour("neutral-400")!, [255, 255, 255])).toBeLessThan(3);
  });
});
