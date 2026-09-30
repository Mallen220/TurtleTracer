// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, SequenceItem } from "../../types";
import {
  toUser,
  toUserHeading,
  type CoordinateSystem,
} from "../../utils/coordinates";
import pkg from "../../../package.json";

export type CodeUnits = "imperial" | "metric";

/**
 * A length (stored in inches) as a Java expression. Metric exports show
 * centimetres wrapped in cmToInches() so the numbers match what the user
 * sees in the app.
 */
export function javaLength(inches: number, units: CodeUnits): string {
  return units === "metric"
    ? `cmToInches(${(inches * 2.54).toFixed(3)})`
    : inches.toFixed(3);
}

/**
 * Formats generated Java with prettier. Prettier and its Java plugin are
 * large, so they are loaded on first use rather than with the app. If
 * formatting fails the unformatted source is returned.
 */
export async function formatJava(source: string): Promise<string> {
  try {
    const [{ default: prettier }, { default: javaPlugin }] = await Promise.all([
      import("prettier"),
      import("prettier-plugin-java"),
    ]);
    return await prettier.format(source, {
      parser: "java",
      plugins: [javaPlugin],
    });
  } catch (error) {
    console.error("Code formatting error:", error);
    return source;
  }
}

/** The sequence with every macro replaced by its own steps, recursively. */
export function flattenMacros(sequence: SequenceItem[]): SequenceItem[] {
  return sequence.flatMap((item) =>
    item.kind === "macro" ? flattenMacros(item.sequence ?? []) : [item],
  );
}

/** Comment block placed at the top of generated Java files. */
export const AUTO_GENERATED_FILE_WARNING_MESSAGE: string = `
/* ============================================================= *
 *                 Turtle Tracer — Auto-Generated                *
 *                                                               *
 *  Version: ${pkg.version}.                                              *
 *  Copyright (c) ${new Date().getFullYear()} Matthew Allen                             *
 *                                                               *
 *  THIS FILE IS AUTO-GENERATED — DO NOT EDIT MANUALLY.          *
 *  Changes will be overwritten when regenerated.                *
 * ============================================================= */
`;

export type FormatOptions = {
  coordinateSystem: CoordinateSystem;
  codeUnits: CodeUnits;
};

/** A heading as stored on a point, a piecewise segment or a chain. */
export type HeadingConfig = {
  heading?: string;
  degrees?: number;
  startDeg?: number;
  endDeg?: number;
  targetX?: number;
  targetY?: number;
  reverse?: boolean;
  segments?: HeadingConfig[];
  tEnd?: number;
};

/**
 * A pose literal. With FTC coordinates it goes through the generated
 * buildPose() helper, which converts to Pedro coordinates.
 */
export function poseCode(
  pt: { x: number; y: number },
  opts: FormatOptions,
  degrees?: number,
): string {
  const { codeUnits } = opts;
  if (opts.coordinateSystem === "FTC") {
    const u = toUser(pt, "FTC");
    const heading = toUserHeading(degrees ?? 0, "FTC").toFixed(3);
    return `buildPose(${javaLength(u.x, codeUnits)}, ${javaLength(u.y, codeUnits)}, ${heading})`;
  }
  const heading = degrees === undefined ? "0.0" : degrees.toFixed(3);
  return `p.of(${javaLength(pt.x, codeUnits)}, ${javaLength(pt.y, codeUnits)}, ${heading})`;
}

export function angleCode(degrees: number, opts: FormatOptions): string {
  return opts.coordinateSystem === "FTC"
    ? `Math.toRadians(${toUserHeading(degrees, "FTC").toFixed(3)})`
    : `Math.toRadians(${degrees})`;
}

/** Writes the arguments of an interpolator, e.g. the two angles of a linear one. */
export type InterpolatorArgs = (h: HeadingConfig) => string;

/** e.g. `Interpolator.linear(a, b).reverse()`. */
export function interpolatorCode(
  h: HeadingConfig,
  args: InterpolatorArgs,
): string {
  let base: string;
  switch (h.heading) {
    case "constant":
    case "linear":
    case "facingPoint":
      base = `Interpolator.${h.heading}(${args(h)})`;
      break;
    case "tangential":
      base = "Interpolator.tangent";
      break;
    default:
      return "";
  }
  return h.reverse ? `${base}.reverse()` : base;
}

/** The path builder call that sets its heading, e.g. `.linear(a, b)`. */
export function headingMethodCode(
  h: HeadingConfig,
  args: InterpolatorArgs,
): string {
  if (h.heading === "piecewise") {
    const segments = h.segments ?? [];
    if (segments.length === 0) return ".tangent()";
    const until = segments
      .map((seg) => `.until(${seg.tEnd}, ${interpolatorCode(seg, args)})`)
      .join("\n          ");
    return h.reverse
      ? `.heading(Interpolator.piecewise()\n          ${until}\n          .reverse())`
      : `.heading(Interpolator.piecewise()\n          ${until}\n        )`;
  }

  if (h.reverse) {
    if (h.heading === "tangential") return ".reverseTangent()";
    const code = interpolatorCode(h, args);
    return code ? `.heading(${code})` : "";
  }

  switch (h.heading) {
    case "constant":
      return `.constant(${args(h)})`;
    case "linear":
      return `.linear(${args(h)})`;
    case "tangential":
      return ".tangent()";
    case "facingPoint":
      return `.facingPoint(${args(h)})`;
    default:
      return "";
  }
}

/** The heading a chain's first line sets for the whole chain, if any. */
export function chainGlobalHeading(
  lines: Line[],
  idx: number,
): HeadingConfig | null {
  let root = idx;
  while (root > 0 && lines[root].isChain) root--;
  const line = lines[root];
  if (!line.globalHeading || line.globalHeading === "none") return null;
  return {
    heading: line.globalHeading,
    reverse: line.globalReverse,
    degrees: line.globalDegrees,
    startDeg: line.globalStartDeg,
    endDeg: line.globalEndDeg,
    targetX: line.globalTargetX,
    targetY: line.globalTargetY,
    segments: line.globalSegments,
  };
}

/**
 * Splits items (one per line) into chains: a line that isn't chained starts
 * a new group, and the chained lines after it join that group.
 */
export function groupChains<T>(lines: Line[], items: T[]): T[][] {
  const groups: T[][] = [];
  items.forEach((item, i) => {
    if (i > 0 && lines[i].isChain) groups.at(-1)!.push(item);
    else groups.push([item]);
  });
  return groups;
}

/**
 * Makes names unique by adding _1, _2, ... to repeats:
 * ["a", "a", "b"] -> ["a", "a_1", "b"].
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name);
    seen.set(name, (count ?? 0) + 1);
    return count === undefined ? name : `${name}_${count}`;
  });
}

/** A line's name as a Java identifier, or `fallback` if it has none. */
export function identifierFor(name: string | undefined, fallback: string) {
  return name ? name.replaceAll(/[^a-zA-Z0-9]/g, "") : fallback;
}
