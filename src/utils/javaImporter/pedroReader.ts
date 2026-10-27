// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Reads paths from Pedro Pathing 3 code, in Java or Kotlin: poses (p.of,
// new Pose, buildPose, pp.get), line(...) / curve(...) segments, path(...)
// chains and their headings, the order they're followed in, waits, turns and
// event markers. It works out the values the code would have, as far as the
// building blocks above go; it isn't an interpreter, so anything else it
// meets is skipped, with a note for the user.
import type {
  EventMarker,
  Line,
  PiecewiseSegment,
  Point,
  SequenceItem,
  TurtleData,
} from "../../types";
import { buildPoseTable, poseNameOf } from "../../lib/exporters/poseTable";
import { oppositeAngle } from "../math";
import {
  ExpressionParser,
  tokenize,
  type Expr,
  type SourceLanguage,
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
  /** Java when missing. */
  language?: SourceLanguage;
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
  /** The path's `maxVelocityConstraint`, in in/s. */
  speed?: number;
}

type Value =
  | { t: "number"; value: number }
  | { t: "string"; value: string }
  | { t: "factory"; radians: boolean }
  | { t: "reader"; file: string }
  | { t: "interpolator"; heading: Heading }
  | Pose
  | Segment
  | {
      t: "chain";
      segments: Segment[];
      heading?: Heading;
      name?: string;
      /** The chain's `maxVelocityConstraint`, in in/s. */
      speed?: number;
    }
  /** follower.pathBuilder(), with the paths added so far. */
  | { t: "builder"; segments: Segment[] }
  | { t: "unknown" };

type Chain = Extract<Value, { t: "chain" }>;

/** A step of the robot's route, as the code gives them. */
type Step =
  | { kind: "follow"; chain: Chain; line: number }
  | { kind: "wait"; ms: number }
  | { kind: "turn"; degrees: number };

/** An event marker registered with `onParametric`, waiting for its path. */
interface PendingMarker {
  segment: number;
  t: number;
  name: string;
}

/** What reading the code's calls has found so far. */
interface StepState {
  steps: Step[];
  start: Pose | null;
  /** Markers registered since the last `setCurrentPath`. */
  markers: PendingMarker[];
  /** The markers of each path, by its first segment. */
  markersFor: Map<Segment, PendingMarker[]>;
}

/** A call or `new` expression in the code, at token `i`. */
interface CallSite {
  i: number;
  /** The function, method or class called. */
  name: string;
  line: number;
  args: Expr[] | null;
  isNew: boolean;
}

const asChain = (v: Value): Chain | null =>
  v.t === "chain"
    ? v
    : v.t === "segment"
      ? { t: "chain", segments: [v] }
      : null;

const UNKNOWN: Value = { t: "unknown" };

/** What can start a Kotlin line that continues the expression above it. */
const CONTINUATIONS = new Set([".", "?.", "?:", "&&", "||"]);
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

/** Pedro 3 calls its heading helpers `Interpolator`; older code says `HeadingInterpolator`. */
const isInterpolatorClass = (name: string) =>
  name === "Interpolator" || name === "HeadingInterpolator";

function withReverse(h: Heading, reverse: boolean): Heading {
  return { ...h, reverse: reverse || undefined } as Heading;
}

/**
 * Pedro's `.reverse()`: 180° added to the heading all the way along. On a
 * linear heading that turns its angles round, since reverse there means the
 * long way round (`longLinear`).
 */
function reversed(h: Heading): Heading {
  switch (h.heading) {
    case "linear":
      return {
        ...h,
        startDeg: oppositeAngle(h.startDeg),
        endDeg: oppositeAngle(h.endDeg),
      };
    case "piecewise":
      return {
        ...h,
        segments: h.segments.map(
          (seg) => reversed(seg as unknown as Heading) as PiecewiseSegment,
        ),
      };
    default:
      return withReverse(h, !h.reverse);
  }
}

class Reader {
  private readonly tokens: Token[];
  private readonly parser: ExpressionParser;
  private readonly env = new Map<string, Value>();
  /** Variables in the order they're assigned, with where. */
  private readonly assigned: { name: string; line: number }[] = [];
  readonly notes: ReadNote[] = [];
  private readonly projects = new Map<string, Map<string, Pose> | null>();
  private readonly kotlin: boolean;

  constructor(
    source: string,
    private readonly options: PedroReadOptions,
  ) {
    const language = options.language ?? "java";
    this.kotlin = language === "kotlin";
    this.tokens = tokenize(source, language);
    this.parser = new ExpressionParser(this.tokens, language);
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

  /**
   * The first two arguments as an x and y. When they can't be worked out the
   * result is null, with a note if `line` says where the call is.
   */
  private coordinates(
    args: Expr[],
    line?: number,
  ): { x: number; y: number } | null {
    const x = args[0] && this.number(args[0]);
    const y = args[1] && this.number(args[1]);
    if (typeof x === "number" && typeof y === "number") return { x, y };
    if (line !== undefined) {
      this.note(line, "Couldn't work out where this pose is.");
    }
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
        // kotlin.math.PI
        if (this.kotlin && expr.name === "PI") {
          return { t: "number", value: Math.PI };
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
        if (expr.op === "?:") {
          const left = this.evaluate(expr.left);
          return left.t === "unknown" ? this.evaluate(expr.right) : left;
        }
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

  /** `Math.PI`, `Interpolator.tangent` and the like. */
  private static constant(object: Expr, name: string): Value | null {
    if (object.kind !== "name") return null;
    if (object.name === "Math") {
      if (name === "PI") return { t: "number", value: Math.PI };
      if (name === "E") return { t: "number", value: Math.E };
    }
    if (isInterpolatorClass(object.name) && name === "tangent") {
      return { t: "interpolator", heading: { heading: "tangential" } };
    }
    return null;
  }

  private member(expr: Extract<Expr, { kind: "member" }>): Value {
    const { object, name } = expr;
    const constant = Reader.constant(object, name);
    if (constant) return constant;
    // this.x, paths.x and the like: the variable itself.
    const base = this.evaluate(object);
    if (base.t === "number" && this.kotlin) return Reader.duration(base, name);
    if (base.t === "unknown" || object.kind === "name") {
      const known = this.env.get(name);
      if (known) return known.t === "pose" ? { ...known, name } : known;
    }
    return UNKNOWN;
  }

  /**
   * Kotlin's `0.5.seconds` and `500.milliseconds`, as seconds: the one place
   * they're read (NextFTC's Delay) takes seconds.
   */
  private static duration(n: { value: number }, unit: string): Value {
    if (unit === "seconds") return { t: "number", value: n.value };
    if (unit === "milliseconds") return { t: "number", value: n.value / 1000 };
    return UNKNOWN;
  }

  private construct(expr: Extract<Expr, { kind: "new" }>): Value {
    const { type, args } = expr;
    switch (type) {
      case "Pose":
      case "Point":
        return this.constructPose(args, expr.line);
      case "BezierLine":
      case "BezierCurve":
        return this.segment(args, expr.line);
      case "Path":
      case "TurtleTracerReader":
        return this.constructWrapper(type, args);
      default:
        return UNKNOWN;
    }
  }

  /** `new Pose(x, y, heading)`. */
  private constructPose(args: Expr[], line: number): Value {
    const xy = this.coordinates(args, line);
    if (!xy) return UNKNOWN;
    const pose: Pose = { t: "pose", ...xy };
    // Pose takes its heading in radians.
    if (args[2]) pose.degrees = this.angle(args[2]);
    return pose;
  }

  /** `new Path(segment)` and `new TurtleTracerReader("file.turt", ...)`. */
  private constructWrapper(type: "Path" | "TurtleTracerReader", args: Expr[]) {
    const first = args[0] ? this.evaluate(args[0]) : UNKNOWN;
    if (type === "Path") return first.t === "segment" ? first : UNKNOWN;
    return first.t === "string"
      ? ({ t: "reader", file: first.value } as const)
      : UNKNOWN;
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
      return this.functionCall(callee.name, args, expr.line);
    }
    if (callee.kind !== "member") return UNKNOWN;

    const method = callee.name;
    const target = callee.object;
    const staticCall = this.staticCall(target, method, args);
    if (staticCall) return staticCall;
    if (method === "pathBuilder") return { t: "builder", segments: [] };
    return this.methodCall(this.evaluate(target), method, args, expr.line);
  }

  /** `path(line(a, b), line(b, c))`: the segments of every argument, in order. */
  private joinPaths(args: Expr[]): Value {
    const segments: Segment[] = [];
    for (const arg of args) {
      const v = this.evaluate(arg);
      if (v.t === "segment") segments.push(v);
      else if (v.t === "chain") segments.push(...v.segments);
      else return UNKNOWN;
    }
    return segments.length > 0 ? { t: "chain", segments } : UNKNOWN;
  }

  /** `line(...)`, `path(...)` and the other plain functions. */
  private functionCall(name: string, args: Expr[], line: number): Value {
    switch (name) {
      case "line":
      case "curve":
        return this.segment(args, line);
      case "path":
        return this.joinPaths(args);
      case "cmToInches": {
        const cm = args[0] && this.number(args[0]);
        return typeof cm === "number"
          ? { t: "number", value: cm / 2.54 }
          : UNKNOWN;
      }
      case "buildPose": {
        // The generated helper for FTC coordinates: degrees, centre origin.
        const xy = this.coordinates(args);
        const h = args[2] ? this.number(args[2]) : 0;
        if (!xy) return UNKNOWN;
        return { t: "pose", x: xy.y + 72, y: 72 - xy.x, degrees: h ?? 0 };
      }
      default:
        return UNKNOWN;
    }
  }

  /**
   * `Math.toRadians(...)`, `PoseFactory.degrees()` and `Interpolator.linear(...)`:
   * calls on a class. Null if `target` isn't one of them, or the method isn't
   * one that it has.
   */
  private staticCall(target: Expr, method: string, args: Expr[]): Value | null {
    if (target.kind !== "name") return null;

    if (target.name === "Math") return this.mathCall(method, args);
    if (target.name === "PoseFactory") {
      if (method === "degrees") return { t: "factory", radians: false };
      if (method === "radians") return { t: "factory", radians: true };
      return null;
    }
    if (isInterpolatorClass(target.name)) {
      return this.interpolator(method, args) ?? UNKNOWN;
    }
    return null;
  }

  /** `Math.toRadians(n)` and `Math.toDegrees(n)`. */
  private mathCall(method: string, args: Expr[]): Value {
    const n = args[0] ? this.number(args[0]) : null;
    if (n === null) return UNKNOWN;
    if (method === "toRadians") return { t: "number", value: toRadians(n) };
    if (method === "toDegrees") return { t: "number", value: toDegrees(n) };
    return UNKNOWN;
  }

  /** A method called on a value we know something about. */
  private methodCall(
    object: Value,
    method: string,
    args: Expr[],
    line: number,
  ): Value {
    switch (object.t) {
      case "number":
        // Kotlin's conversions, such as `90.toDouble()`.
        return /^to(Double|Float|Int|Long)$/.test(method) ? object : UNKNOWN;
      case "factory":
        return method === "of"
          ? this.poseFromFactory(object.radians, args, line)
          : UNKNOWN;
      case "reader":
        return method === "get"
          ? this.projectPose(object.file, args[0], line)
          : UNKNOWN;
      case "pose":
        return this.poseMethod(object, method, args);
      case "interpolator":
        return this.interpolatorMethod(object.heading, method, args) ?? UNKNOWN;
      case "segment":
      case "chain":
        return this.pathMethod(object, method, args, line);
      case "builder":
        return this.builderMethod(object, method, args);
      default:
        return UNKNOWN;
    }
  }

  /** `p.of(x, y, heading)`, with the heading in the factory's units. */
  private poseFromFactory(radians: boolean, args: Expr[], line: number): Value {
    const xy = this.coordinates(args, line);
    if (!xy) return UNKNOWN;
    const h = args[2] ? this.number(args[2]) : null;
    const pose: Pose = { t: "pose", ...xy };
    if (h !== null) pose.degrees = radians ? toDegrees(h) : h;
    return pose;
  }

  /** `.build()` and the heading calls on a path or chain of them. */
  private pathMethod(
    path: Segment | Chain,
    method: string,
    args: Expr[],
    line: number,
  ): Value {
    if (method === "build") return path;
    if (method === "with") return this.withModifiers(path, args, line);
    const heading = this.headingMethod(method, args);
    return heading ? { ...path, heading } : UNKNOWN;
  }

  /**
   * `.with(Constants.foresightConfig.maxVelocityConstraint.at(30.0))`: the
   * speed limit of a path or chain. Other modifiers are left out, with a
   * note, and the path is read without them.
   */
  private withModifiers(
    path: Segment | Chain,
    args: Expr[],
    line: number,
  ): Value {
    let speed = path.speed;
    for (const arg of args) {
      // `<something>.<modifier>.at(<value>)`
      const isAt =
        arg.kind === "call" &&
        arg.callee.kind === "member" &&
        arg.callee.name === "at" &&
        arg.callee.object.kind === "member";
      const modifier =
        isAt && arg.kind === "call" && arg.callee.kind === "member"
          ? (arg.callee.object as Extract<Expr, { kind: "member" }>).name
          : null;
      const value =
        modifier === "maxVelocityConstraint" && arg.kind === "call"
          ? this.number(arg.args[0]!)
          : null;
      if (value !== null && value > 0) {
        speed = value;
      } else {
        this.note(
          line,
          modifier === "maxVelocityConstraint"
            ? "A max speed that isn't a number above zero is left out."
            : `${modifier ?? "This modifier"} isn't read; only a maxVelocityConstraint (the path's max speed) is.`,
        );
      }
    }
    return { ...path, speed };
  }

  /** `.withHeading(...)` and `.getHeading()` on a pose. */
  private poseMethod(pose: Pose, method: string, args: Expr[]): Value {
    if (method === "withHeading" && args[0]) {
      return { ...pose, degrees: this.angle(args[0]), name: undefined };
    }
    if (method === "getHeading" || method === "heading") {
      return pose.degrees === undefined
        ? UNKNOWN
        : { t: "number", value: toRadians(pose.degrees) };
    }
    return UNKNOWN;
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
      case "linear": {
        const linear: Heading = {
          heading: "linear",
          startDeg: this.angle(args[0]),
          endDeg: this.angle(args[1]),
        };
        // Pedro 2's setLinearHeadingInterpolation(start, end, endTime, reversed).
        const reverse = args[3]?.kind === "name" && args[3].name === "true";
        return reverse ? reversed(linear) : linear;
      }
      // The long way round: longLinear in Pedro 3, reversedLinear in Pedro 2.
      case "longLinear":
      case "reversedLinear":
        return {
          heading: "linear",
          startDeg: this.angle(args[0]),
          endDeg: this.angle(args[1]),
          reverse: true,
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
    if (last) {
      const edited = this.editLastSegment(last, method, args);
      if (edited) {
        return {
          t: "builder",
          segments: [...builder.segments.slice(0, -1), edited],
        };
      }
    }
    // Callbacks, constraints and the like don't change where it goes.
    return builder;
  }

  /** The segment with a heading call such as `.setReversed(true)` applied, or null if `method` isn't one. */
  private editLastSegment(
    segment: Segment,
    method: string,
    args: Expr[],
  ): Segment | null {
    if (method === "setReversed") {
      const heading = segment.heading ?? { heading: "tangential" as const };
      // Pedro 2's setReversed() reverses the heading; Pedro 1's
      // setReversed(on) switches to a tangent heading, backwards or not.
      if (args.length === 0) return { ...segment, heading: reversed(heading) };
      const on = !(args[0]?.kind === "name" && args[0].name === "false");
      return {
        ...segment,
        heading: withReverse({ heading: "tangential" }, on),
      };
    }
    const heading = this.headingMethod(method, args);
    return heading ? { ...segment, heading } : null;
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
      return { t: "interpolator", heading: reversed(heading) };
    }
    if (method === "until" && heading.heading === "piecewise") {
      const tEnd = args[0] ? this.number(args[0]) : null;
      const part = args[1] ? this.evaluate(args[1]) : UNKNOWN;
      if (tEnd === null || part.t !== "interpolator") return null;
      const inner = part.heading;
      if (inner.heading === "piecewise") return null;
      const tStart = heading.segments.at(-1)?.tEnd ?? 0;
      const { reverse, ...rest } = inner;
      return {
        t: "interpolator",
        heading: {
          ...heading,
          segments: [
            ...heading.segments,
            {
              ...rest,
              ...(reverse ? { reverse } : {}),
              tStart,
              tEnd,
            } as PiecewiseSegment,
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

  /**
   * The variable assigned by the `=` (or Kotlin `by`) at token `i`. In
   * Kotlin that's before the type, if there is one: `val start: Pose = ...`.
   */
  private assignmentTarget(i: number): Token | null {
    const before = this.tokens[i - 1];
    if (before?.kind !== "name" && !this.kotlin) return null;
    if (this.kotlin) {
      let j = i - 1;
      const isTypePart = (t: Token) =>
        t.kind === "name" ||
        [".", "<", ">", ">>", ",", "?", "*"].includes(t.text);
      while (
        j > 0 &&
        isTypePart(this.tokens[j]!) &&
        this.tokens[j]!.line === before?.line
      ) {
        j--;
      }
      const name = this.tokens[j - 1];
      if (this.tokens[j]?.text === ":") {
        // `fun f(): Pose = ...` has a return type, not a variable.
        return name?.kind === "name" ? name : null;
      }
    }
    return before?.kind === "name" ? before : null;
  }

  /**
   * Where the value of `val x by lazy { ... }` starts: the last statement in
   * the braces at `open`.
   */
  private lazyValueStart(open: number): number {
    const close = this.parser.closing(open);
    let start = open + 1;
    let depth = 0;
    for (let i = open + 1; i < close; i++) {
      const t = this.tokens[i]!;
      // A line starting `.member` or `?: x` carries on the one before.
      const continues = CONTINUATIONS.has(t.text) && t.kind === "symbol";
      const newStatement =
        depth === 0 &&
        ((t.line > this.tokens[i - 1]!.line && !continues) ||
          this.tokens[i - 1]!.text === ";");
      if (newStatement) start = i;
      if ("([{".includes(t.text) && t.kind === "symbol") depth++;
      if (")]}".includes(t.text) && t.kind === "symbol") depth--;
    }
    return start;
  }

  /** Every `name = value` in the file, worked out in order. */
  private readAssignments() {
    const assignments: { name: string; start: number; line: number }[] = [];
    // Kotlin's named arguments and default parameter values are `=` in brackets.
    let parens = 0;
    this.tokens.forEach((t, i) => {
      if (t.kind === "symbol" && t.text === "(") parens++;
      if (t.kind === "symbol" && t.text === ")") parens--;
      const lazy =
        this.kotlin &&
        t.text === "by" &&
        this.tokens[i + 1]?.text === "lazy" &&
        this.tokens[i + 2]?.text === "{";
      const assigns = t.kind === "symbol" && t.text === "=";
      if (!lazy && !(assigns && !(this.kotlin && parens > 0))) return;
      const target = this.assignmentTarget(i);
      if (!target) return;
      const start = lazy ? this.lazyValueStart(i + 2) : i + 1;
      assignments.push({ name: target.text, start, line: target.line });
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

  /**
   * What each call that matters does to the steps collected so far. The key is
   * the name called or constructed.
   */
  private readonly stepReaders: Record<
    string,
    (call: CallSite, state: StepState) => void
  > = {
    setPose: (call, state) => this.readStart(call, state),
    setStartingPose: (call, state) => this.readStart(call, state),
    follow: (call, state) => this.readFollow(call, state),
    followPath: (call, state) => this.readFollow(call, state),
    FollowPathCommand: (call, state) => {
      if (call.isNew) this.readFollow(call, state);
    },
    WaitCommand: (call, state) => this.readWaitCommand(call, state),
    Delay: (call, state) => this.readWaitCommand(call, state),
    waitMs: (call, state) => this.readWaitMs(call, state),
    milliseconds: (call, state) => this.readTimerWait(call, state),
    getElapsedTimeSeconds: (call, state) => this.readTimerWait(call, state),
    withHeading: (call, state) => this.readHoldTurn(call, state),
    setTangentHeadingInterpolation: (call) => this.readPathHeading(call),
    setConstantHeadingInterpolation: (call) => this.readPathHeading(call),
    setLinearHeadingInterpolation: (call) => this.readPathHeading(call),
    setHeadingInterpolation: (call) => this.readPathHeading(call),
    turnTo: (call, state) =>
      state.steps.push({ kind: "turn", degrees: this.angle(call.args?.[0]) }),
    turnToDegrees: (call, state) => {
      const value = this.argNumber(call, 0);
      if (value !== null) state.steps.push({ kind: "turn", degrees: value });
    },
    onParametric: (call, state) => this.readMarker(call, state),
    setCurrentPath: (call, state) => this.readCurrentPath(call, state),
    clearPathEvents: (_call, state) => {
      state.markers = [];
    },
  };

  /** The number the call's `n`th argument works out to, if it does. */
  private argNumber(call: CallSite, n: number): number | null {
    return call.args?.[n] ? this.number(call.args[n]) : null;
  }

  /** `follower.setPose(start)`: where the robot starts. */
  private readStart(call: CallSite, state: StepState) {
    const pose = call.args?.[0] && this.pose(call.args[0]);
    if (pose && !state.start) state.start = pose;
  }

  /** `follower.follow(path)` / `PedroCommands.follow(follower, path)`. */
  private readFollow(call: CallSite, state: StepState) {
    for (const arg of call.args ?? []) {
      const chain = asChain(this.evaluate(arg));
      if (!chain) continue;
      const name = this.nameOf(arg);
      const named = name ? { ...chain, name } : chain;
      state.steps.push({ kind: "follow", chain: named, line: call.line });
      return;
    }
  }

  /** `new WaitCommand(ms)`, or NextFTC's `new Delay(seconds)`. */
  private readWaitCommand(call: CallSite, state: StepState) {
    if (!call.isNew) return;
    const value = this.argNumber(call, 0);
    if (value === null) return;
    state.steps.push({
      kind: "wait",
      ms: call.name === "Delay" ? value * 1000 : value,
    });
  }

  private readWaitMs(call: CallSite, state: StepState) {
    const value = this.argNumber(call, 0);
    if (value !== null) state.steps.push({ kind: "wait", ms: value });
  }

  /** `pathTimer.milliseconds() > 1000`, in a state machine. */
  private readTimerWait(call: CallSite, state: StepState) {
    const { i } = call;
    const close =
      this.tokens[i + 1]?.text === "(" ? this.parser.closing(i + 1) : i;
    if (this.tokens[close + 1]?.text !== ">") return;
    const { expr } = this.parser.parse(close + 2);
    const value = this.number(expr);
    if (value === null) return;
    state.steps.push({
      kind: "wait",
      ms: call.name === "milliseconds" ? value : value * 1000,
    });
  }

  /** `follower.hold(follower.pose().withHeading(radians))`: a turn. */
  private readHoldTurn(call: CallSite, state: StepState) {
    const holding = this.tokens
      .slice(Math.max(0, call.i - 8), call.i)
      .some((x) => x.text === "hold");
    if (holding) {
      state.steps.push({ kind: "turn", degrees: this.angle(call.args?.[0]) });
    }
  }

  /** `scorePath.setLinearHeadingInterpolation(a, b)`, on a Path variable. */
  private readPathHeading(call: CallSite) {
    const { i } = call;
    const owner = this.tokens[i - 2];
    if (this.tokens[i - 1]?.text !== "." || owner?.kind !== "name") return;
    const path = this.env.get(owner.text);
    const heading = this.headingMethod(call.name, call.args ?? []);
    if (path?.t === "segment" && heading) {
      this.env.set(owner.text, { ...path, heading });
    }
  }

  /** `tracker.onParametric(segment, t, command)`: an event marker for the next path set. */
  private readMarker(call: CallSite, state: StepState) {
    const segment = this.argNumber(call, 0);
    const at = this.argNumber(call, 1);
    const name = call.args?.[2] ? this.markerName(call.args[2]) : null;
    if (segment !== null && at !== null && name) {
      state.markers.push({ segment, t: at, name });
    }
  }

  /** `tracker.setCurrentPath(path)`: the markers so far belong to that path. */
  private readCurrentPath(call: CallSite, state: StepState) {
    const chain = call.args?.[0] ? asChain(this.evaluate(call.args[0])) : null;
    if (chain && state.markers.length > 0) {
      const key = chain.segments[0]!;
      state.markersFor.set(key, [
        ...(state.markersFor.get(key) ?? []),
        ...state.markers,
      ]);
    }
    state.markers = [];
  }

  /** What the robot is told to do, in the order the code says it. */
  private readSteps() {
    const state: StepState = {
      steps: [],
      start: null,
      markers: [],
      markersFor: new Map(),
    };

    this.tokens.forEach((t, i) => {
      if (t.kind !== "name") return;
      const args = this.callArgs(i);
      const isTimer =
        t.text === "milliseconds" || t.text === "getElapsedTimeSeconds";
      if (!args && !isTimer) return;

      // Java is free to call something `toString` or `constructor`.
      if (!Object.hasOwn(this.stepReaders, t.text)) return;
      const before = this.tokens[i - 1]?.text;
      // Kotlin constructs a class by calling it.
      const isNew =
        before === "new" ||
        (this.kotlin &&
          /^[A-Z]/.test(t.text) &&
          before !== "." &&
          before !== "?.");
      this.stepReaders[t.text](
        { i, name: t.text, line: t.line, args, isNew },
        state,
      );
    });
    return {
      steps: state.steps,
      start: state.start,
      markersFor: state.markersFor,
    };
  }

  /** `NamedCommands.getCommand("Intake")` or `"Intake"`. */
  private markerName(expr: Expr): string | null {
    if (expr.kind === "string") return expr.value;
    if (expr.kind === "call" && expr.args[0]?.kind === "string") {
      return expr.args[0].value;
    }
    return null;
  }

  /** Notes a path that doesn't start where the one before it ends. */
  private noteGap(
    previousEnd: Pose | null,
    first: Pose,
    chain: Chain,
    line: number,
  ) {
    if (!previousEnd) return;
    const gap = Math.hypot(first.x - previousEnd.x, first.y - previousEnd.y);
    if (gap > 0.5) {
      this.note(
        line,
        `${chain.name ?? "This path"} starts ${gap.toFixed(1)}" from where the path before it ends; it's drawn from there.`,
      );
    }
  }

  /** The line for segment `k` of a chain, as number `index` in the project. */
  private toLine(
    segment: Segment,
    k: number,
    chain: Chain,
    chainMarkers: PendingMarker[],
    index: number,
  ): Line {
    const first = segment.points[0]!;
    const end = segment.points.at(-1)!;
    const own =
      segment.heading ??
      (chain.heading ? undefined : { heading: "tangential" as const });
    // The end pose's variable is the line's name in the app's own exports;
    // otherwise the path's.
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
      controlPoints: segment.points.slice(1, -1).map(({ x, y }) => ({ x, y })),
      color: COLORS[index % COLORS.length]!,
      isChain: k > 0,
      eventMarkers: markers,
    };
    if (k === 0 && chain.heading) {
      Object.assign(line, globalHeading(chain.heading));
    }
    if (segment.speed !== undefined) line.maxSpeed = segment.speed;
    if (k === 0 && chain.speed !== undefined) line.chainMaxSpeed = chain.speed;
    return line;
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
        this.noteGap(previousEnd, segment.points[0]!, chain, step.line);
        const line = this.toLine(segment, k, chain, chainMarkers, lines.length);
        lines.push(line);
        sequence.push({
          kind: "path",
          lineId: line.id!,
          isChain: k > 0 || undefined,
        } as SequenceItem);
        previousEnd = segment.points.at(-1)!;
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
 * The paths in Pedro Pathing 3 code (Java unless `options.language` says
 * Kotlin), as a project, with notes on anything that couldn't be read. A
 * project with no lines means none were found.
 */
export function readPedroJava(
  source: string,
  options: PedroReadOptions = {},
): PedroReadResult {
  return new Reader(source, options).read();
}
