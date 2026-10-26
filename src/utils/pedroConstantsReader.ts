// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Reads the numbers Turtle Tracer has settings for out of a team's Pedro
// constants file (Java or Kotlin, Pedro 3 `ForesightConfig` or Pedro 2
// `FollowerConstants`). It reads source text, not a running program, so it
// understands number literals, simple arithmetic, and local variables, and
// leaves out anything it can't work out.

import type { Settings } from "../types";

export type PedroValueKey =
  | "xVelocity"
  | "yVelocity"
  | "maxVelocity"
  | "maxAcceleration"
  | "maxDeceleration"
  | "pathSettleTime"
  | "pedroQuadraticBrakeForward"
  | "pedroQuadraticBrakeStrafe"
  | "pedroLinearBrakeForward"
  | "pedroLinearBrakeStrafe";

/** A setting's value as the constants file has it. */
export interface PedroValue {
  setting: PedroValueKey;
  value: number;
  /** The Pedro name it came from, such as `maxAchievableForwardVelocity`. */
  source: string;
}

/** What a constants file says. */
export interface PedroValues {
  /** Which Pedro it is written for, from the code's own style. */
  version: "v2" | "v3" | null;
  values: PedroValue[];
}

const VALUE_LABELS: Record<PedroValueKey, string> = {
  xVelocity: "Forward velocity",
  yVelocity: "Strafe velocity",
  maxVelocity: "Max velocity",
  maxAcceleration: "Max acceleration",
  maxDeceleration: "Max deceleration",
  pathSettleTime: "Path settle time",
  pedroQuadraticBrakeForward: "Handover brake, quadratic (forward)",
  pedroQuadraticBrakeStrafe: "Handover brake, quadratic (strafe)",
  pedroLinearBrakeForward: "Handover brake, linear (forward)",
  pedroLinearBrakeStrafe: "Handover brake, linear (strafe)",
};

/** A value that differs from what the settings have. */
export interface ValueChange {
  setting: keyof Settings;
  label: string;
  value: number | string;
  current: number | string;
  /** Where the value was read from, for display. */
  source: string;
}

const SAME = 1e-9;

/** The values that differ from the settings. */
export function changedValues(
  values: PedroValue[],
  settings: Settings,
): ValueChange[] {
  return values
    .filter(
      (v) => Math.abs(((settings[v.setting] as number) ?? 0) - v.value) > SAME,
    )
    .map((v) => ({
      setting: v.setting,
      label: VALUE_LABELS[v.setting],
      value: v.value,
      current: (settings[v.setting] as number) ?? 0,
      source: v.source,
    }));
}

// --- Reading source text ---

/** The code with comments blanked out, so commented-out settings don't count. */
function stripComments(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '"' || c === "'") {
      let end = i + 1;
      while (end < source.length && source[end] !== c && source[end] !== "\n") {
        end += source[end] === "\\" ? 2 : 1;
      }
      out += source.slice(i, end + 1);
      i = end;
    } else if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replaceAll(/[^\n]/g, " ");
      i = stop - 1;
    } else {
      out += c;
    }
  }
  return out;
}

/** The text inside the bracket at `open`, and the index after its partner. */
function balanced(
  source: string,
  open: number,
): { inner: string; end: number } | null {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return { inner: source.slice(open + 1, i), end: i + 1 };
    }
  }
  return null;
}

/** `text` split at the commas that aren't inside brackets. */
function splitArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) depth--;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  const last = text.slice(start);
  if (last.trim() !== "") parts.push(last);
  return parts.map((p) => p.trim());
}

/** The expression that starts at `start`, up to the end of its statement. */
function readExpression(source: string, start: number): string {
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if ("([{".includes(c)) depth++;
    else if (")]}".includes(c)) {
      if (depth === 0) return source.slice(start, i);
      depth--;
    } else if (depth === 0 && (c === ";" || c === ",")) {
      return source.slice(start, i);
    } else if (depth === 0 && c === "\n") {
      // Kotlin has no semicolons: a line continues if the next starts with a dot.
      const rest = source.slice(i + 1).trimStart();
      if (!rest.startsWith(".")) return source.slice(start, i);
    }
  }
  return source.slice(start);
}

const DECLARATION =
  /\b(?:(?:static|final|public|private|protected|const|var|val|double|float|Double|Float|int|long|Controller|Matrix|Vector2D)\s+)+(\w+)\s*(?::\s*[\w.]+\s*)?=(?!=)/g;

/** Variables the file declares, by name, with the expression each is set to. */
function readVariables(source: string): Map<string, string> {
  const variables = new Map<string, string>();
  for (const match of source.matchAll(DECLARATION)) {
    if (variables.has(match[1])) continue;
    variables.set(
      match[1],
      readExpression(source, match.index + match[0].length).trim(),
    );
  }
  return variables;
}

type Variables = Map<string, string>;

const MAX_DEPTH = 8;

/** The value of a number expression: literals, + - * /, brackets, variables. */
function evaluate(
  expression: string,
  variables: Variables,
  depth = 0,
): number | null {
  if (depth > MAX_DEPTH) return null;
  const tokens =
    expression.match(
      /(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?[dDfFlL]?|[A-Za-z_][\w.]*|[-+*/()]/g,
    ) ?? [];
  let at = 0;

  const primary = (): number | null => {
    const token = tokens[at++];
    if (token === undefined) return null;
    if (token === "(") {
      const inner = sum();
      if (tokens[at++] !== ")") return null;
      return inner;
    }
    if (token === "-") {
      const inner = primary();
      return inner === null ? null : -inner;
    }
    if (token === "+") return primary();
    if (/^[\d.]/.test(token)) return Number(token.replace(/[dDfFlL]$/, ""));
    const named = variables.get(token);
    return named === undefined ? null : evaluate(named, variables, depth + 1);
  };
  const product = (): number | null => {
    let left = primary();
    while (left !== null && (tokens[at] === "*" || tokens[at] === "/")) {
      const operator = tokens[at++];
      const right = primary();
      if (right === null) return null;
      left = operator === "*" ? left * right : left / right;
    }
    return left;
  };
  const sum = (): number | null => {
    let left = product();
    while (left !== null && (tokens[at] === "+" || tokens[at] === "-")) {
      const operator = tokens[at++];
      const right = product();
      if (right === null) return null;
      left = operator === "+" ? left + right : left - right;
    }
    return left;
  };

  const result = sum();
  return result !== null && at === tokens.length && Number.isFinite(result)
    ? result
    : null;
}

/** The arguments of the call that starts at `start` (just before its bracket). */
function callArguments(
  source: string,
  start: number,
): { args: string[]; end: number } | null {
  const open = source.indexOf("(", start);
  if (open === -1) return null;
  const group = balanced(source, open);
  return group ? { args: splitArguments(group.inner), end: group.end } : null;
}

// --- What the file sets ---

/** The expression `name.set(...)` sets, or null if the file never sets it. */
function configured(source: string, name: string): string | null {
  const match = new RegExp(String.raw`\b${name}\s*\.\s*set\s*\(`).exec(source);
  if (!match) return null;
  const group = balanced(source, match.index + match[0].length - 1);
  return group ? group.inner.trim() : null;
}

/** The two numbers of a `Matrix.diag(forward, strafe)` expression. */
function diagonal(
  expression: string | null,
  variables: Variables,
): [number, number] | null {
  if (expression === null) return null;
  const text = /^\w+$/.test(expression)
    ? (variables.get(expression) ?? "")
    : expression;
  const call = /(?:\bMatrix\s*\.\s*)?diag\s*\(/.exec(text);
  const args = call && callArguments(text, call.index + call[0].length - 1);
  if (!args || args.args.length < 2) return null;
  const forward = evaluate(args.args[0], variables);
  const strafe = evaluate(args.args[1], variables);
  return forward === null || strafe === null ? null : [forward, strafe];
}

const positive = (n: number | null): n is number => n !== null && n > 0;
const nonNegative = (n: number | null): n is number => n !== null && n >= 0;

/** The first of the candidates with a positive number. */
function firstPositive(
  candidates: [number | null, string][],
): { value: number; source: string } | null {
  for (const [value, source] of candidates) {
    if (positive(value)) return { value, source };
  }
  return null;
}

/** The version of Pedro a file is written for, if its style says. */
function versionOf(source: string): "v2" | "v3" | null {
  if (
    /\b(ForesightConfig|Foresight)\b|com\.pedropathing\.algorithm|\bc\s*\.\s*\w+\s*\.\s*set\s*\(/.test(
      source,
    )
  ) {
    return "v3";
  }
  if (
    /\b(FollowerConstants|FollowerBuilder|MecanumConstants|ZeroPowerAcceleration)\b|com\.pedropathing\.ftc\./.test(
      source,
    )
  ) {
    return "v2";
  }
  return null;
}

/** A Pedro 2 `new PathConstraints(...)`'s timeout, in milliseconds. */
function pathConstraintsTimeout(
  source: string,
  variables: Variables,
): number | null {
  const match = /\bPathConstraints\s*\(/.exec(source);
  const call =
    match && callArguments(source, match.index + match[0].length - 1);
  if (!call) return null;
  // (tValue, timeout), (tValue, timeout, brakingStrength, brakingStart) or all eight.
  const position = call.args.length === 8 ? 4 : 1;
  if (call.args.length !== 2 && call.args.length !== 4 && position === 1) {
    return null;
  }
  return evaluate(call.args[position] ?? "", variables);
}

/**
 * What a Pedro constants file sets that Turtle Tracer has a setting for.
 * A Pedro 3 ForesightConfig comes first; the Pedro 2 names fill in what it
 * doesn't set.
 */
export function readPedroValues(content: string): PedroValues {
  const source = stripComments(content);
  const variables = readVariables(source);
  const values: PedroValue[] = [];
  const found = new Map<PedroValueKey, PedroValue>();
  const add = (setting: PedroValueKey, value: number, from: string) => {
    if (!found.has(setting)) {
      found.set(setting, { setting, value, source: from });
    }
  };

  const number = (name: string) => {
    const expression = configured(source, name);
    return expression === null ? null : evaluate(expression, variables);
  };
  const builder = (name: string) => {
    const match = new RegExp(String.raw`\.\s*${name}\s*\(`).exec(source);
    const call =
      match && callArguments(source, match.index + match[0].length - 1);
    return call?.args[0] === undefined
      ? null
      : evaluate(call.args[0], variables);
  };

  // Pedro 3 names first, then Pedro 2's.
  const forward = firstPositive([
    [number("maxAchievableForwardVelocity"), "maxAchievableForwardVelocity"],
    [builder("xVelocity"), "xVelocity"],
  ]);
  const strafe = firstPositive([
    [number("maxAchievableStrafeVelocity"), "maxAchievableStrafeVelocity"],
    [builder("yVelocity"), "yVelocity"],
  ]);
  if (forward) add("xVelocity", forward.value, forward.source);
  if (strafe) add("yVelocity", strafe.value, strafe.source);

  // Max velocity is the robot's best speed, unless Pedro is told to go slower.
  const fastest = [forward, strafe]
    .filter((v) => v !== null)
    .toSorted((a, b) => b.value - a.value)[0];
  const limit = number("maxVelocityConstraint");
  if (positive(limit) && (!fastest || limit < fastest.value)) {
    add("maxVelocity", limit, "maxVelocityConstraint");
  } else if (fastest) {
    add("maxVelocity", fastest.value, fastest.source);
  }

  const acceleration = number("maxAccelerationConstraint");
  if (positive(acceleration)) {
    add("maxAcceleration", acceleration, "maxAccelerationConstraint");
  }

  // Only a limit the team set. `naturalForwardDeceleration` (Pedro 3) and
  // `forwardZeroPowerAcceleration` (Pedro 2) are how fast the robot slows
  // with no power, about a third of how fast it brakes, so they would make
  // every stop in the simulation far too gentle. Translational P isn't read
  // either: the simulation's P is an effective stiffness fitted to the robot's
  // corners, not Pedro's controller gain.
  const deceleration = number("maxDecelerationConstraint");
  if (positive(deceleration)) {
    add("maxDeceleration", deceleration, "maxDecelerationConstraint");
  }

  const timeout = number("timeoutConstraint");
  if (nonNegative(timeout)) {
    add("pathSettleTime", timeout / 1000, "timeoutConstraint");
  } else {
    const legacy = pathConstraintsTimeout(source, variables);
    if (nonNegative(legacy))
      add("pathSettleTime", legacy / 1000, "PathConstraints");
  }

  const quadratic = diagonal(
    configured(source, "quadraticBrakeCoefficients"),
    variables,
  );
  const linear = diagonal(
    configured(source, "linearBrakeCoefficients"),
    variables,
  );
  if (quadratic && linear && [...quadratic, ...linear].every((n) => n >= 0)) {
    add(
      "pedroQuadraticBrakeForward",
      quadratic[0],
      "quadraticBrakeCoefficients",
    );
    add(
      "pedroQuadraticBrakeStrafe",
      quadratic[1],
      "quadraticBrakeCoefficients",
    );
    add("pedroLinearBrakeForward", linear[0], "linearBrakeCoefficients");
    add("pedroLinearBrakeStrafe", linear[1], "linearBrakeCoefficients");
  }

  // In the order the settings show them.
  for (const key of Object.keys(VALUE_LABELS) as PedroValueKey[]) {
    const value = found.get(key);
    if (value) values.push(value);
  }
  return { version: versionOf(source), values };
}
