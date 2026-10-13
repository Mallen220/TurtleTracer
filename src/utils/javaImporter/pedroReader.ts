// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Reads paths from Pedro Pathing 3 code: poses (p.of, new Pose, buildPose,
// pp.get), line(...) / curve(...) segments, path(...) chains and their
// headings, the order they're followed in, waits, turns and event markers.
// It works out the values the code would have, as far as the building blocks
// above go; it isn't a Java interpreter, so anything else it meets is skipped,
// with a note for the user.
import type {
  EventMarker,
  Line,
  PiecewiseSegment,
  Point,
  SequenceItem,
  TurtleData,
} from "../../types";
import { buildPoseTable, poseNameOf } from "../../lib/exporters/poseTable";
import {
  ExpressionParser,
  tokenize,
  type Expr,
  type Token,
} from "./javaTokens";

/** Something the reader couldn't make sense of, for the user. */
export interface ReadNote {
  line: number;
  message: string;
}

export interface PedroReadResult {
  project: TurtleData;
  notes: ReadNote[];
}

export interface PedroReadOptions {
  /**
   * The project a `new TurtleTracerReader("file.turt", ...)` loads its poses
   * from, or null if it can't be found.
   */
  projectFile?: (fileName: string) => TurtleData | null;
}

type Heading =
  | { heading: "tangential"; reverse?: boolean }
  | { heading: "constant"; degrees: number; reverse?: boolean }
  | { heading: "linear"; startDeg: number; endDeg: number; reverse?: boolean }
  | {
      heading: "facingPoint";
      targetX: number;
      targetY: number;
      reverse?: boolean;
    }
  | { heading: "piecewise"; segments: PiecewiseSegment[]; reverse?: boolean };

interface Pose {
  t: "pose";
  x: number;
  y: number;
  /** Degrees, if the pose has a heading. */
  degrees?: number;
  /** The variable it was read from, for naming lines. */
  name?: string;
  /**
   * For a pose loaded from a project file, the event markers of the path
   * there that ends at it: code that loads its poses at runtime takes its
   * markers from the file too.
   */
  markers?: EventMarker[];
}

interface Segment {
  t: "segment";
  points: Pose[];
  heading?: Heading;
}

type Value =
  | { t: "number"; value: number }
  | { t: "string"; value: string }
  | { t: "factory"; radians: boolean }
  | { t: "reader"; file: string }
  | { t: "interpolator"; heading: Heading }
  | Pose
  | Segment
  | { t: "chain"; segments: Segment[]; heading?: Heading; name?: string }
  /** follower.pathBuilder(), with the paths added so far. */
  | { t: "builder"; segments: Segment[] }
  | { t: "unknown" };

type Chain = Extract<Value, { t: "chain" }>;

const UNKNOWN: Value = { t: "unknown" };
const toDegrees = (radians: number) => (radians * 180) / Math.PI;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Line colours, the same each time a file is read so they don't flicker. */
const COLORS = [
  "#60a5fa",
  "#f472b6",
  "#34d399",
  "#fbbf24",
  "#a78bfa",
  "#f87171",
  "#2dd4bf",
  "#fb923c",
];

function withReverse(h: Heading, reverse: boolean): Heading {
  return { ...h, reverse: reverse || undefined } as Heading;
}

class Reader {
  private readonly tokens: Token[];
  private readonly parser: ExpressionParser;
  private readonly env = new Map<string, Value>();
  /** Variables in the order they're assigned, with where. */
  private readonly assigned: { name: string; line: number }[] = [];
  readonly notes: ReadNote[] = [];
  private readonly projects = new Map<string, Map<string, Pose> | null>();

  constructor(
    source: string,
    private readonly options: PedroReadOptions,
  ) {
    this.tokens = tokenize(source);
    this.parser = new ExpressionParser(this.tokens);
  }

  private note(line: number, message: string) {
    if (!this.notes.some((n) => n.line === line && n.message === message)) {
      this.notes.push({ line, message });
    }
  }

  // --- Values ---------------------------------------------------------------

  private number(expr: Expr): number | null {
    const v = this.evaluate(expr);
    return v.t === "number" ? v.value : null;
  }

  /** An angle argument in radians, as Pedro takes them, in degrees. */
  private angle(expr: Expr | undefined): number {
    if (!expr) return 0;
    // Math.toRadians(90) is 90 degrees exactly.
    if (
      expr.kind === "call" &&
      expr.callee.kind === "member" &&
      expr.callee.name === "toRadians" &&
      expr.callee.object.kind === "name" &&
      expr.callee.object.name === "Math" &&
      expr.args[0]
    ) {
      const degrees = this.number(expr.args[0]);
      if (degrees !== null) return degrees;
    }
    const value = this.number(expr);
    if (value === null) {
      this.note(expr.line, "Couldn't work out an angle here; using 0°.");
      return 0;
    }
    return Math.round(toDegrees(value) * 1e9) / 1e9;
  }

  private pose(expr: Expr | undefined): Pose | null {
    if (!expr) return null;
    const v = this.evaluate(expr);
    if (v.t === "pose") return v;
    this.note(
      expr.line,
      expr.kind === "name"
        ? `Couldn't find where ${expr.name} is.`
        : "Couldn't work out a pose here.",
    );
    return null;
  }

  private nameOf(expr: Expr): string | null {
    if (expr.kind === "name") return expr.name;
    if (expr.kind === "member") return expr.name;
    return null;
  }

  private evaluate(expr: Expr): Value {
    switch (expr.kind) {
      case "number":
        return { t: "number", value: expr.value };
      case "string":
        return { t: "string", value: expr.value };
      case "name": {
        const known = this.env.get(expr.name);
        if (known) {
          return known.t === "pose" ? { ...known, name: expr.name } : known;
        }
        return UNKNOWN;
      }
      case "member":
        return this.member(expr);
      case "call":
        return this.call(expr);
      case "new":
        return this.construct(expr);
      case "unary": {
        const v = this.number(expr.operand);
        if (v === null) return UNKNOWN;
        return { t: "number", value: expr.op === "-" ? -v : v };
      }
      case "binary": {
        const a = this.number(expr.left);
        const b = this.number(expr.right);
        if (a === null || b === null) return UNKNOWN;
        const ops: Record<string, number> = {
          "+": a + b,
          "-": a - b,
          "*": a * b,
          "/": a / b,
          "%": a % b,
        };
        const value = ops[expr.op];
        return value === undefined ? UNKNOWN : { t: "number", value };
      }
      case "conditional":
        return UNKNOWN;
      default:
        return UNKNOWN;
    }
  }

  private member(expr: Extract<Expr, { kind: "member" }>): Value {
    const { object, name } = expr;
    if (object.kind === "name" && object.name === "Math") {
      if (name === "PI") return { t: "number", value: Math.PI };
      if (name === "E") return { t: "number", value: Math.E };
    }
    if (
      object.kind === "name" &&
      (object.name === "Interpolator" || object.name === "HeadingInterpolator")
    ) {
      if (name === "tangent") {
        return { t: "interpolator", heading: { heading: "tangential" } };
      }
    }
    // this.x, paths.x and the like: the variable itself.
    const base = this.evaluate(object);
    if (base.t === "unknown" || object.kind === "name") {
      const known = this.env.get(name);
      if (known) return known.t === "pose" ? { ...known, name } : known;
    }
    return UNKNOWN;
  }

  private construct(expr: Extract<Expr, { kind: "new" }>): Value {
    const { type, args } = expr;
    if (type === "Pose" || type === "Point") {
      const x = args[0] && this.number(args[0]);
      const y = args[1] && this.number(args[1]);
      if (typeof x !== "number" || typeof y !== "number") {
        this.note(expr.line, "Couldn't work out where this pose is.");
        return UNKNOWN;
      }
      const pose: Pose = { t: "pose", x, y };
      // Pose takes its heading in radians.
      if (args[2]) pose.degrees = this.angle(args[2]);
      return pose;
    }
    if (type === "BezierLine" || type === "BezierCurve") {
      return this.segment(args, expr.line);
    }
    if (type === "Path") {
      const inner = args[0] ? this.evaluate(args[0]) : UNKNOWN;
      return inner.t === "segment" ? inner : UNKNOWN;
    }
    if (type === "TurtleTracerReader") {
      const file = args[0] ? this.evaluate(args[0]) : UNKNOWN;
      if (file.t === "string") return { t: "reader", file: file.value };
    }
    return UNKNOWN;
  }

  private segment(args: Expr[], line: number): Value {
    const points = args.map((a) => this.pose(a));
    if (points.length < 2 || points.includes(null)) {
      if (points.length < 2)
        this.note(line, "A path needs at least two points.");
      return UNKNOWN;
    }
    return { t: "segment", points: points as Pose[] };
  }

  private call(expr: Extract<Expr, { kind: "call" }>): Value {
    const { callee, args } = expr;

    if (callee.kind === "name") {
      switch (callee.name) {
        case "line":
        case "curve":
          return this.segment(args, expr.line);
        case "path": {
          const segments: Segment[] = [];
          for (const arg of args) {
            const v = this.evaluate(arg);
            if (v.t === "segment") segments.push(v);
            else if (v.t === "chain") segments.push(...v.segments);
            else return UNKNOWN;
          }
          return segments.length > 0 ? { t: "chain", segments } : UNKNOWN;
        }
        case "cmToInches": {
          const cm = args[0] && this.number(args[0]);
          return typeof cm === "number"
            ? { t: "number", value: cm / 2.54 }
            : UNKNOWN;
        }
        case "buildPose": {
          // The generated helper for FTC coordinates: degrees, centre origin.
          const x = args[0] && this.number(args[0]);
          const y = args[1] && this.number(args[1]);
          const h = args[2] ? this.number(args[2]) : 0;
          if (typeof x !== "number" || typeof y !== "number") return UNKNOWN;
          return { t: "pose", x: y + 72, y: 72 - x, degrees: h ?? 0 };
        }
      }
      return UNKNOWN;
    }

    if (callee.kind !== "member") return UNKNOWN;
    const method = callee.name;
    const target = callee.object;

    if (target.kind === "name" && target.name === "Math") {
      const n = args[0] ? this.number(args[0]) : null;
      if (n === null) return UNKNOWN;
      if (method === "toRadians") return { t: "number", value: toRadians(n) };
      if (method === "toDegrees") return { t: "number", value: toDegrees(n) };
      return UNKNOWN;
    }
    if (target.kind === "name" && target.name === "PoseFactory") {
      if (method === "degrees") return { t: "factory", radians: false };
      if (method === "radians") return { t: "factory", radians: true };
    }
    if (
      target.kind === "name" &&
      (target.name === "Interpolator" || target.name === "HeadingInterpolator")
    ) {
      return this.interpolator(method, args) ?? UNKNOWN;
    }
    if (method === "pathBuilder") return { t: "builder", segments: [] };

    const object = this.evaluate(target);
    switch (object.t) {
      case "factory":
        if (method === "of") {
          const x = args[0] && this.number(args[0]);
          const y = args[1] && this.number(args[1]);
          if (typeof x !== "number" || typeof y !== "number") {
            this.note(expr.line, "Couldn't work out where this pose is.");
            return UNKNOWN;
          }
          const h = args[2] ? this.number(args[2]) : null;
          const pose: Pose = { t: "pose", x, y };
          if (h !== null) pose.degrees = object.radians ? toDegrees(h) : h;
          return pose;
        }
        return UNKNOWN;
      case "reader":
        return method === "get"
          ? this.projectPose(object.file, args[0], expr.line)
          : UNKNOWN;
      case "pose":
        if (method === "withHeading" && args[0]) {
          return { ...object, degrees: this.angle(args[0]), name: undefined };
        }
        if (method === "getHeading" || method === "heading") {
          return object.degrees === undefined
            ? UNKNOWN
            : { t: "number", value: toRadians(object.degrees) };
        }
        return UNKNOWN;
      case "interpolator":
        return this.interpolatorMethod(object.heading, method, args) ?? UNKNOWN;
      case "segment":
      case "chain": {
        if (method === "build") return object;
        const heading = this.headingMethod(method, args);
        return heading ? { ...object, heading } : UNKNOWN;
      }
      case "builder":
        return this.builderMethod(object, method, args);
      default:
        return UNKNOWN;
    }
  }

  /** `.tangent()`, `.linear(a, b)` and the other heading calls on a path. */
  private headingMethod(method: string, args: Expr[]): Heading | null {
    // Pedro Pathing 1 and 2 names for the same.
    const older: Record<string, string> = {
      setTangentHeadingInterpolation: "tangent",
      setConstantHeadingInterpolation: "constant",
      setLinearHeadingInterpolation: "linear",
      setHeadingInterpolation: "heading",
    };
    method = older[method] ?? method;
    switch (method) {
      case "tangent":
        return { heading: "tangential" };
      case "reverseTangent":
        return { heading: "tangential", reverse: true };
      case "constant":
        return { heading: "constant", degrees: this.angle(args[0]) };
      case "linear":
        return {
          heading: "linear",
          startDeg: this.angle(args[0]),
          endDeg: this.angle(args[1]),
        };
      case "facingPoint": {
        const target = this.pose(args[0]);
        return target
          ? { heading: "facingPoint", targetX: target.x, targetY: target.y }
          : null;
      }
      case "heading": {
        const v = args[0] ? this.evaluate(args[0]) : UNKNOWN;
        return v.t === "interpolator" ? v.heading : null;
      }
      default:
        return null;
    }
  }

  /** `.addPath(...)`, its heading calls and `.build()` on a path builder. */
  private builderMethod(
    builder: Extract<Value, { t: "builder" }>,
    method: string,
    args: Expr[],
  ): Value {
    if (method === "addPath") {
      const v = args[0] ? this.evaluate(args[0]) : UNKNOWN;
      const added = v.t === "segment" ? [v] : v.t === "chain" ? v.segments : [];
      return { t: "builder", segments: [...builder.segments, ...added] };
    }
    if (method === "build") {
      return builder.segments.length > 0
        ? { t: "chain", segments: builder.segments }
        : UNKNOWN;
    }
    const last = builder.segments.at(-1);
    if (method === "setReversed" && last) {
      const on = !(args[0]?.kind === "name" && args[0].name === "false");
      const heading = last.heading ?? { heading: "tangential" as const };
      const reversed = { ...last, heading: withReverse(heading, on) };
      return {
        t: "builder",
        segments: [...builder.segments.slice(0, -1), reversed],
      };
    }
    const heading = this.headingMethod(method, args);
    if (heading && last) {
      return {
        t: "builder",
        segments: [...builder.segments.slice(0, -1), { ...last, heading }],
      };
    }
    // Callbacks, constraints and the like don't change where it goes.
    return builder;
  }

  /** `Interpolator.linear(a, b)` and friends. */
  private interpolator(method: string, args: Expr[]): Value | null {
    if (method === "piecewise") {
      return {
        t: "interpolator",
        heading: { heading: "piecewise", segments: [] },
      };
    }
    const heading =
      method === "tangent"
        ? { heading: "tangential" as const }
        : this.headingMethod(method, args);
    return heading ? { t: "interpolator", heading } : null;
  }

  /** `.reverse()` and, on a piecewise one, `.until(t, interpolator)`. */
  private interpolatorMethod(
    heading: Heading,
    method: string,
    args: Expr[],
  ): Value | null {
    if (method === "reverse") {
      return { t: "interpolator", heading: withReverse(heading, true) };
    }
    if (method === "until" && heading.heading === "piecewise") {
      const tEnd = args[0] ? this.number(args[0]) : null;
      const part = args[1] ? this.evaluate(args[1]) : UNKNOWN;
      if (tEnd === null || part.t !== "interpolator") return null;
      const inner = part.heading;
      if (inner.heading === "piecewise") return null;
      const tStart = heading.segments.at(-1)?.tEnd ?? 0;
      const { reverse: _reverse, ...rest } = inner;
      return {
        t: "interpolator",
        heading: {
          ...heading,
          segments: [
            ...heading.segments,
            { ...rest, tStart, tEnd } as PiecewiseSegment,
          ],
        },
      };
    }
    return null;
  }

  /** A pose loaded at runtime with `pp.get("name")`, from its project file. */
  private projectPose(
    file: string,
    arg: Expr | undefined,
    line: number,
  ): Value {
    const name = arg ? this.evaluate(arg) : UNKNOWN;
    if (name.t !== "string") return UNKNOWN;
    if (!this.projects.has(file)) {
      const project = this.options.projectFile?.(file) ?? null;
      this.projects.set(file, project ? projectPoses(project) : null);
    }
    const poses = this.projects.get(file);
    if (!poses) {
      this.note(
        line,
        `Couldn't find ${file}, which this loads its poses from.`,
      );
      return UNKNOWN;
    }
    const pose = poses.get(name.value);
    if (!pose) {
      this.note(line, `${file} has no pose named ${name.value}.`);
      return UNKNOWN;
    }
    return pose;
  }

  // --- The file -------------------------------------------------------------

  /** Every `name = value` in the file, worked out in order. */
  private readAssignments() {
    const assignments: { name: string; start: number; line: number }[] = [];
    this.tokens.forEach((t, i) => {
      if (t.kind !== "symbol" || t.text !== "=") return;
      const target = this.tokens[i - 1];
      if (target?.kind !== "name") return;
      assignments.push({ name: target.text, start: i + 1, line: target.line });
    });
    // Twice, so a value can use one assigned later in the file (a field
    // declared below the constructor that sets it, say).
    for (let pass = 0; pass < 2; pass++) {
      for (const a of assignments) {
        const quietNotes = this.notes.length;
        const value = this.evaluate(this.parser.parse(a.start).expr);
        if (pass === 0) this.notes.length = quietNotes;
        if (value.t === "unknown") continue;
        if (!this.env.has(a.name))
          this.assigned.push({ name: a.name, line: a.line });
        this.env.set(a.name, value);
      }
    }
  }

  /** The arguments of a call to `name` at token `i`, if it is one. */
  private callArgs(i: number): Expr[] | null {
    return this.tokens[i + 1]?.text === "(" ? this.parser.args(i + 1) : null;
  }

  /** What the robot is told to do, in the order the code says it. */
  private readSteps() {
    type Step =
      | { kind: "follow"; chain: Chain; line: number }
      | { kind: "wait"; ms: number }
      | { kind: "turn"; degrees: number };
    const steps: Step[] = [];
    let start: Pose | null = null;
    let markers: { segment: number; t: number; name: string }[] = [];
    // By the first segment of the path they're for.
    const markersFor = new Map<Segment, typeof markers>();
    const asChain = (v: Value): Chain | null =>
      v.t === "chain"
        ? v
        : v.t === "segment"
          ? { t: "chain", segments: [v] }
          : null;

    this.tokens.forEach((t, i) => {
      if (t.kind !== "name") return;
      const args = this.callArgs(i);
      const previous = this.tokens[i - 1]?.text;
      const isNew = previous === "new";
      if (
        !args &&
        !(t.text === "milliseconds" || t.text === "getElapsedTimeSeconds")
      ) {
        return;
      }

      switch (t.text) {
        case "setPose":
        case "setStartingPose": {
          const pose = args?.[0] && this.pose(args[0]);
          if (pose && !start) start = pose;
          break;
        }
        case "follow":
        case "followPath":
        case "FollowPathCommand": {
          if (t.text === "FollowPathCommand" && !isNew) break;
          // follower.follow(path) / PedroCommands.follow(follower, path)
          const candidates = args ?? [];
          for (const arg of candidates) {
            const chain = asChain(this.evaluate(arg));
            if (!chain) continue;
            const name = this.nameOf(arg);
            const named = name ? { ...chain, name } : chain;
            steps.push({ kind: "follow", chain: named, line: t.line });
            break;
          }
          break;
        }
        case "WaitCommand":
        case "Delay": {
          if (!isNew) break;
          const value = args?.[0] ? this.number(args[0]) : null;
          if (value === null) break;
          // WaitCommand takes milliseconds; NextFTC's Delay takes seconds.
          steps.push({
            kind: "wait",
            ms: t.text === "Delay" ? value * 1000 : value,
          });
          break;
        }
        case "waitMs": {
          const value = args?.[0] ? this.number(args[0]) : null;
          if (value !== null) steps.push({ kind: "wait", ms: value });
          break;
        }
        case "milliseconds":
        case "getElapsedTimeSeconds": {
          // pathTimer.milliseconds() > 1000, in a state machine.
          const close =
            this.tokens[i + 1]?.text === "(" ? this.parser.closing(i + 1) : i;
          if (this.tokens[close + 1]?.text !== ">") break;
          const { expr } = this.parser.parse(close + 2);
          const value = this.number(expr);
          if (value === null) break;
          steps.push({
            kind: "wait",
            ms: t.text === "milliseconds" ? value : value * 1000,
          });
          break;
        }
        case "withHeading": {
          // follower.hold(follower.pose().withHeading(radians)): a turn.
          const holding = this.tokens
            .slice(Math.max(0, i - 8), i)
            .some((x) => x.text === "hold");
          if (holding)
            steps.push({ kind: "turn", degrees: this.angle(args?.[0]) });
          break;
        }
        case "setTangentHeadingInterpolation":
        case "setConstantHeadingInterpolation":
        case "setLinearHeadingInterpolation":
        case "setHeadingInterpolation": {
          // scorePath.setLinearHeadingInterpolation(a, b), on a Path variable.
          const owner = this.tokens[i - 2];
          if (this.tokens[i - 1]?.text !== "." || owner?.kind !== "name") break;
          const path = this.env.get(owner.text);
          const heading = this.headingMethod(t.text, args ?? []);
          if (path?.t === "segment" && heading) {
            this.env.set(owner.text, { ...path, heading });
          }
          break;
        }
        case "turnTo":
          steps.push({ kind: "turn", degrees: this.angle(args?.[0]) });
          break;
        case "turnToDegrees": {
          const value = args?.[0] ? this.number(args[0]) : null;
          if (value !== null) steps.push({ kind: "turn", degrees: value });
          break;
        }
        case "onParametric": {
          const segment = args?.[0] ? this.number(args[0]) : null;
          const at = args?.[1] ? this.number(args[1]) : null;
          const name = args?.[2] ? this.markerName(args[2]) : null;
          if (segment !== null && at !== null && name) {
            markers.push({ segment, t: at, name });
          }
          break;
        }
        case "setCurrentPath": {
          const chain = args?.[0] ? asChain(this.evaluate(args[0])) : null;
          if (chain && markers.length > 0) {
            const key = chain.segments[0]!;
            markersFor.set(key, [...(markersFor.get(key) ?? []), ...markers]);
          }
          markers = [];
          break;
        }
        case "clearPathEvents":
          markers = [];
          break;
      }
    });
    return { steps, start: start as Pose | null, markersFor };
  }

  /** `NamedCommands.getCommand("Intake")` or `"Intake"`. */
  private markerName(expr: Expr): string | null {
    if (expr.kind === "string") return expr.value;
    if (expr.kind === "call" && expr.args[0]?.kind === "string") {
      return expr.args[0].value;
    }
    return null;
  }

  read(): PedroReadResult {
    this.readAssignments();
    const { steps, start, markersFor } = this.readSteps();

    // Without any follow calls, the paths in the order they're written.
    let followed = steps;
    if (!steps.some((s) => s.kind === "follow")) {
      followed = this.assigned.flatMap(({ name, line }) => {
        const v = this.env.get(name)!;
        const chain: Chain | null =
          v.t === "chain"
            ? { ...v, name }
            : v.t === "segment"
              ? { t: "chain", segments: [v], name }
              : null;
        return chain ? [{ kind: "follow" as const, chain, line }] : [];
      });
      followed = [...followed, ...steps];
    }

    const lines: Line[] = [];
    const sequence: SequenceItem[] = [];
    let previousEnd: Pose | null = null;
    for (const step of followed) {
      if (step.kind === "wait") {
        sequence.push({
          kind: "wait",
          id: `java-wait-${sequence.length}`,
          name: "",
          durationMs: Math.round(step.ms),
        });
        continue;
      }
      if (step.kind === "turn") {
        sequence.push({
          kind: "rotate",
          id: `java-turn-${sequence.length}`,
          name: "Rotate",
          // Exports write radians to 3 places, about 0.06°.
          degrees: Math.round(step.degrees * 10) / 10,
        });
        continue;
      }
      const { chain } = step;
      const chainMarkers = markersFor.get(chain.segments[0]!) ?? [];
      chain.segments.forEach((segment, k) => {
        const index = lines.length;
        const first = segment.points[0]!;
        if (
          previousEnd &&
          Math.hypot(first.x - previousEnd.x, first.y - previousEnd.y) > 0.5
        ) {
          this.note(
            step.line,
            `${chain.name ?? "This path"} starts ${Math.hypot(first.x - previousEnd.x, first.y - previousEnd.y).toFixed(1)}" from where the path before it ends; it's drawn from there.`,
          );
        }
        const end = segment.points.at(-1)!;
        const own =
          segment.heading ??
          (chain.heading ? undefined : { heading: "tangential" as const });
        // The end pose's variable is the line's name in the app's own
        // exports; otherwise the path's.
        const name =
          end.name ??
          (k === 0
            ? (chain.name ?? `Path ${index + 1}`)
            : `${chain.name ?? "Path"} ${k + 1}`);
        const fromCode = chainMarkers.filter((m) => m.segment === k);
        const markers: EventMarker[] =
          fromCode.length > 0
            ? fromCode.map((m, j) => ({
                id: `java-marker-${index}-${j}`,
                name: m.name,
                position: m.t,
                lineIndex: index,
              }))
            : (end.markers ?? []).map((m, j) => ({
                ...m,
                id: `java-marker-${index}-${j}`,
                lineIndex: index,
              }));
        const line: Line = {
          id: `java-line-${index}`,
          name,
          startPoint: { x: first.x, y: first.y } as Point,
          endPoint: {
            x: end.x,
            y: end.y,
            ...(own ?? { heading: "tangential" }),
            reverse: own?.reverse ?? false,
          } as Point,
          controlPoints: segment.points
            .slice(1, -1)
            .map(({ x, y }) => ({ x, y })),
          color: COLORS[index % COLORS.length]!,
          isChain: k > 0,
          eventMarkers: markers,
        };
        if (k === 0 && chain.heading)
          Object.assign(line, globalHeading(chain.heading));
        lines.push(line);
        sequence.push({
          kind: "path",
          lineId: line.id!,
          isChain: k > 0 || undefined,
        } as SequenceItem);
        previousEnd = end;
      });
    }

    const first =
      lines.length > 0 ? followed.find((s) => s.kind === "follow") : undefined;
    const startPose =
      start ??
      (first?.kind === "follow" ? first.chain.segments[0]!.points[0]! : null);
    const startPoint: Point = startPose
      ? ({
          x: startPose.x,
          y: startPose.y,
          heading: "constant",
          degrees: startPose.degrees ?? 0,
        } as Point)
      : ({ x: 72, y: 72, heading: "constant", degrees: 0 } as Point);

    return {
      project: { startPoint, lines, sequence, shapes: [] },
      notes: this.notes.toSorted((a, b) => a.line - b.line),
    };
  }
}

/** The poses a project file gives `pp.get(...)`, by name. */
function projectPoses(project: TurtleData): Map<string, Pose> {
  const markersAt = new Map(
    project.lines.map((line, i) => [
      poseNameOf(project.lines, i),
      (line.eventMarkers ?? []).filter(
        (m) => (m.type ?? "parametric") === "parametric",
      ),
    ]),
  );
  return new Map(
    buildPoseTable(project.startPoint, project.lines, project.sequence).map(
      (e) => [
        e.name,
        {
          t: "pose",
          x: e.x,
          y: e.y,
          degrees: e.degrees,
          markers: markersAt.get(e.name),
        } as Pose,
      ],
    ),
  );
}

/** A chain heading as the fields a chain's first line keeps it in. */
function globalHeading(h: Heading): Partial<Line> {
  const fields: Partial<Line> = {
    globalHeading: h.heading,
    globalReverse: h.reverse,
  };
  if (h.heading === "constant") fields.globalDegrees = h.degrees;
  if (h.heading === "linear") {
    fields.globalStartDeg = h.startDeg;
    fields.globalEndDeg = h.endDeg;
  }
  if (h.heading === "facingPoint") {
    fields.globalTargetX = h.targetX;
    fields.globalTargetY = h.targetY;
  }
  if (h.heading === "piecewise") fields.globalSegments = h.segments;
  return fields;
}

/**
 * The paths in Pedro Pathing 3 code, as a project, with notes on anything
 * that couldn't be read. A project with no lines means none were found.
 */
export function readPedroJava(
  source: string,
  options: PedroReadOptions = {},
): PedroReadResult {
  return new Reader(source, options).read();
}
