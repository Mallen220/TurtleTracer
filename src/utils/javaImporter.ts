// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Imports paths from a Pedro Pathing Java file (such as one exported by this
// app). This is a best-effort reader, not a Java interpreter: it recognises
// the common ways of writing poses, paths, headings, waits and turns.
//
// Tokens come from java-parser's syntax tree. Identifiers, numbers and
// brackets are in source order, but commas are often moved to the end of an
// argument list, so commas are ignored everywhere below.
import { parse } from "java-parser";
import { getRandomColor } from "./draw";
import { makeId } from "./nameGenerator";
import { walkAST, extractTokens } from "./javaImporter/visitor";
import {
  readPedroJava,
  type PedroReadOptions,
} from "./javaImporter/pedroReader";
import type {
  TurtleData,
  Point,
  Line,
  SequenceItem,
  EventMarker,
} from "../types";

const IDENTIFIER = /^[a-zA-Z_]\w*$/;

const toDegrees = (rad: number) => (rad * 180) / Math.PI;

const defaultStartPoint = (): Point => ({
  x: 0,
  y: 0,
  heading: "linear",
  startDeg: 0,
  endDeg: 0,
});

/** Index of the ")" that closes the "(" at `open`, or -1. */
function findClosingParen(tokens: string[], open: number): number {
  let depth = 0;
  for (let i = open; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    if (tokens[i] === ")") depth--;
    if (depth === 0) return i;
  }
  return -1;
}

/** The tokens inside the first parenthesised group at or after `from`. */
function argsAfter(tokens: string[], from = 0): string[] {
  const open = tokens.indexOf("(", from);
  if (open === -1) return [];
  const close = findClosingParen(tokens, open);
  return close === -1 ? [] : tokens.slice(open + 1, close);
}

type Arg =
  | { kind: "number"; value: number } // a plain literal
  | { kind: "degrees"; value: number } // x from Math.toRadians(x)
  | { kind: "headingOf"; pose: string } // pose.getHeading()
  | { kind: "name"; name: string };

/** Reads the values in an argument list, skipping anything unrecognised. */
function readArgs(tokens: string[]): Arg[] {
  const args: Arg[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    // Tokens consumed by this argument, including the first.
    let consumed = 1;

    if (
      t === "Math" &&
      tokens[i + 1] === "." &&
      tokens[i + 2] === "toRadians"
    ) {
      const close = findClosingParen(tokens, i + 3);
      if (close === -1) break;
      const value = Number.parseFloat(tokens.slice(i + 4, close).join(""));
      if (Number.isFinite(value)) args.push({ kind: "degrees", value });
      consumed = close - i + 1;
    } else if (
      IDENTIFIER.test(t) &&
      tokens[i + 1] === "." &&
      tokens[i + 2] === "getHeading"
    ) {
      args.push({ kind: "headingOf", pose: t });
      consumed = 5; // pose . getHeading ( )
    } else if (Number.isFinite(Number.parseFloat(t))) {
      args.push({ kind: "number", value: Number.parseFloat(t) });
    } else if (t === "-" && Number.isFinite(Number.parseFloat(tokens[i + 1]))) {
      args.push({ kind: "number", value: -Number.parseFloat(tokens[i + 1]) });
      consumed = 2;
    } else if (IDENTIFIER.test(t)) {
      args.push({ kind: "name", name: t });
    }
    i += consumed;
  }
  return args;
}

/** The heading a pose was declared with, in degrees. */
function headingOfPose(pose: Point | undefined): number | null {
  return pose?.degrees ?? pose?.startDeg ?? null;
}

/** Converts an argument to degrees. Plain numbers are radians, as in Pedro Pathing. */
function toAngle(arg: Arg, points: Map<string, Point>): number | null {
  switch (arg.kind) {
    case "degrees":
      return arg.value;
    case "number":
      return toDegrees(arg.value);
    case "headingOf":
      return headingOfPose(points.get(arg.pose)) ?? 0;
    default:
      return null;
  }
}

function readAngles(tokens: string[], points: Map<string, Point>): number[] {
  return readArgs(tokens)
    .map((arg) => toAngle(arg, points))
    .filter((a): a is number => a !== null);
}

/**
 * Parses the first `(...)` in `tokens` as pose arguments: `(x, y)`,
 * `(x, y, heading)` or `(otherPose)`. Returns null if it isn't one.
 */
function parsePose(tokens: string[], points: Map<string, Point>): Point | null {
  const args = readArgs(argsAfter(tokens));
  const [xArg, yArg, headingArg] = args.filter((a) => a.kind !== "name");

  if (xArg && yArg && "value" in xArg && "value" in yArg) {
    const pose = { x: xArg.value, y: yArg.value } as Point;
    const degrees = headingArg ? toAngle(headingArg, points) : null;
    return degrees === null
      ? pose
      : ({ ...pose, heading: "constant", degrees } as Point);
  }

  if (args.length === 1 && args[0].kind === "name") {
    const ref = points.get(args[0].name);
    return ref ? { ...ref } : null;
  }
  return null;
}

const createsPose = (tokens: string[]) =>
  tokens.includes("new") &&
  (tokens.includes("Pose") || tokens.includes("Point"));

/** Records `name = new Pose(...)` style assignments in `points`. */
function recordPoseAssignment(tokens: string[], points: Map<string, Point>) {
  const eqIdx = tokens.indexOf("=");
  if (eqIdx === -1) return;
  const name = tokens[0];
  const value = tokens.slice(eqIdx + 1);

  if (createsPose(value)) {
    const pose = parsePose(value, points);
    if (pose) points.set(name, pose);
  } else if (value.includes("pp") && value.includes("get")) {
    // pp.get("name") loads a pose at runtime; we can't know where it is.
    points.set(name, defaultStartPoint());
  }
}

/**
 * Splits the arguments of `new BezierLine(...)` / `new BezierCurve(...)`
 * into one token list per point: either a single name or a `new Pose(...)`.
 */
function splitBezierArgs(tokens: string[]): string[][] {
  const args: string[][] = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] === ",") {
      i++;
    } else if (tokens[i] === "new") {
      const close = findClosingParen(tokens, tokens.indexOf("(", i));
      if (close === -1) break;
      args.push(tokens.slice(i, close + 1).filter((t) => t !== ","));
      i = close + 1;
    } else {
      args.push([tokens[i]]);
      i++;
    }
  }
  return args;
}

const nameIn = (tokens: string[]) =>
  tokens.find(
    (t) => t !== "new" && t !== "Pose" && t !== "Point" && IDENTIFIER.test(t),
  );

function resolvePathPoint(
  argTokens: string[],
  points: Map<string, Point>,
): Point | null {
  if (createsPose(argTokens)) {
    return parsePose(argTokens, points) ?? ({ x: 0, y: 0 } as Point);
  }
  const name = nameIn(argTokens);
  if (!name) return null;
  return points.get(name) ?? ({ x: 0, y: 0 } as Point);
}

/** Index of `method`, or of `HeadingInterpolator` if it's used with `variant`. */
function findHeadingCall(
  tokens: string[],
  method: string,
  variant: string,
): number {
  if (tokens.includes(method)) return tokens.indexOf(method);
  if (tokens.includes("HeadingInterpolator") && tokens.includes(variant)) {
    return tokens.indexOf("HeadingInterpolator");
  }
  return -1;
}

/** Works out the heading mode of a path from its builder calls. */
function readHeading(
  pathTokens: string[],
  endPoint: Point,
  points: Map<string, Point>,
): Point {
  const base = { ...endPoint };

  const linearAt = findHeadingCall(
    pathTokens,
    "setLinearHeadingInterpolation",
    "linear",
  );
  if (linearAt !== -1) {
    const [startDeg = 0, endDeg = 0] = readAngles(
      argsAfter(pathTokens, linearAt),
      points,
    );
    return { ...base, heading: "linear", startDeg, endDeg } as Point;
  }

  if (
    findHeadingCall(pathTokens, "setTangentHeadingInterpolation", "tangent") !==
    -1
  ) {
    return { ...base, heading: "tangential" } as Point;
  }

  const constantAt = findHeadingCall(
    pathTokens,
    "setConstantHeadingInterpolation",
    "constant",
  );
  if (constantAt !== -1) {
    const [degrees = 0] = readAngles(argsAfter(pathTokens, constantAt), points);
    return { ...base, heading: "constant", degrees } as Point;
  }

  const facingAt = pathTokens.indexOf("facingPoint");
  if (facingAt !== -1) {
    const target = parsePose(pathTokens.slice(facingAt), points);
    return {
      ...base,
      heading: "facingPoint",
      targetX: target?.x ?? 0,
      targetY: target?.y ?? 0,
    } as Point;
  }

  return base;
}

/** `addEventMarker(0.5, "Name")` calls in a path's builder chain. */
function readEventMarkers(pathTokens: string[]): EventMarker[] {
  const markers: EventMarker[] = [];
  pathTokens.forEach((t, i) => {
    if (t !== "addEventMarker") return;
    const args = argsAfter(pathTokens, i);
    const position = args.find((a) => Number.isFinite(Number.parseFloat(a)));
    const name = args.find((a) => a.includes('"'));
    if (position && name) {
      markers.push({
        id: makeId(),
        name: name.replaceAll('"', ""),
        position: Number.parseFloat(position),
      });
    }
  });
  return markers;
}

/** Turns one `x = follower.pathBuilder().addPath(...)...build()` statement into lines. */
function readPathChain(
  tokens: string[],
  points: Map<string, Point>,
  lineCount: number,
): Line[] {
  const chainName = tokens.includes("=") ? tokens[0] : `Path ${lineCount + 1}`;

  const addPathAt = tokens.flatMap((t, i) => (t === "addPath" ? [i] : []));
  const lines: Line[] = [];

  addPathAt.forEach((start, pathIdx) => {
    const pathTokens = tokens.slice(start, addPathAt[pathIdx + 1]);
    const curveAt = pathTokens.findIndex(
      (t) => t === "BezierLine" || t === "BezierCurve",
    );
    if (curveAt === -1) return;

    const args = splitBezierArgs(argsAfter(pathTokens, curveAt));
    const pathPoints = args
      .map((arg) => resolvePathPoint(arg, points))
      .filter((p): p is Point => p !== null);
    if (pathPoints.length < 2) return;

    // Name the line after its end pose's variable when there is one.
    const defaultName =
      addPathAt.length > 1 ? `${chainName} - ${pathIdx + 1}` : chainName;
    const name =
      (args.length > 1 ? nameIn(args.at(-1)!) : undefined) ?? defaultName;

    const endPoint = readHeading(pathTokens, { ...pathPoints.at(-1)! }, points);
    endPoint.reverse = pathTokens.includes("setReversed");

    lines.push({
      id: makeId(),
      name,
      startPoint: pathPoints[0],
      endPoint,
      controlPoints: pathPoints.slice(1, -1).map(({ x, y }) => ({ x, y })),
      color: getRandomColor(),
      isChain: pathIdx > 0,
      eventMarkers: readEventMarkers(pathTokens),
    });
  });

  return lines;
}

/** Milliseconds for `new WaitCommand(ms)` or `new Delay(seconds)`, else null. */
function readWait(tokens: string[]): number | null {
  if (tokens[0] !== "new") return null;
  const type = tokens[1];
  if (type !== "WaitCommand" && type !== "Delay") return null;

  const value = Number.parseFloat(argsAfter(tokens).join(""));
  if (!Number.isFinite(value)) return null;
  // WaitCommand takes milliseconds. Delay takes seconds, but small numbers
  // are the only reliable sign of that, since people also pass milliseconds.
  return Math.round(type === "Delay" && value < 100 ? value * 1000 : value);
}

/** Heading in degrees for a `() -> follower.turnTo(...)` lambda, else null. */
function readTurn(tokens: string[], points: Map<string, Point>): number | null {
  const isZeroArgLambda = tokens[0] === "(" && tokens[2] === "->";
  if (
    !isZeroArgLambda ||
    !tokens.includes("follower") ||
    tokens.includes("WaitUntilCommand")
  ) {
    return null;
  }
  const turnAt = tokens.indexOf("turnTo");
  if (turnAt === -1 || tokens[turnAt - 1] === "!") return null;
  return readAngles(argsAfter(tokens, turnAt), points)[0] ?? 0;
}

/**
 * The paths in a Java file, as a project. Pedro Pathing 3 code (what the app
 * exports now) is read by readPedroJava; older pathBuilder() code by the
 * reader below.
 */
export function importJavaProject(
  javaCode: string,
  options: PedroReadOptions = {},
): TurtleData {
  const pedro = readPedroJava(javaCode, options);
  if (pedro.project.lines.length > 0) return pedro.project;
  return importOlderJava(javaCode);
}

function importOlderJava(javaCode: string): TurtleData {
  let ast;
  try {
    ast = parse(javaCode);
  } catch (e) {
    console.error("Failed to parse Java code:", e);
    return {
      startPoint: defaultStartPoint(),
      lines: [],
      sequence: [],
      shapes: [],
    };
  }

  const points = new Map<string, Point>();
  // Assigned inside the AST callbacks below.
  let startPoint = null as Point | null;

  // Pass 1: named poses and the starting pose.
  walkAST(ast, {
    variableDeclarator: (node) => {
      recordPoseAssignment(extractTokens(node), points);
    },
    statementExpression: (node) => {
      const tokens = extractTokens(node);
      recordPoseAssignment(tokens, points);

      if (tokens.includes("setStartingPose")) {
        const pose = createsPose(tokens)
          ? parsePose(tokens, points)
          : points.get(argsAfter(tokens, tokens.indexOf("setStartingPose"))[0]);
        if (pose) startPoint = { ...pose, locked: false };
      }
    },
  });

  // Pass 2: path chains.
  const lines: Line[] = [];
  walkAST(ast, {
    statementExpression: (node) => {
      const tokens = extractTokens(node);
      const isPathChain =
        (tokens.includes("pathBuilder") || tokens.includes("addPath")) &&
        tokens.includes("build");
      if (isPathChain)
        lines.push(...readPathChain(tokens, points, lines.length));
    },
  });

  // Pass 3: waits and turns in the command sequence.
  const commands: SequenceItem[] = [];
  walkAST(ast, {
    unqualifiedClassInstanceCreationExpression: (node) => {
      const durationMs = readWait(extractTokens(node));
      if (durationMs !== null) {
        commands.push({ kind: "wait", id: makeId(), name: "", durationMs });
      }
    },
    lambdaExpression: (node) => {
      const degrees = readTurn(extractTokens(node), points);
      if (degrees !== null) {
        commands.push({
          kind: "rotate",
          id: makeId(),
          name: "Rotate",
          degrees: Math.round(degrees),
        });
      }
    },
  });

  const sequence: SequenceItem[] = [
    ...lines.map(
      (line): SequenceItem => ({
        kind: "path",
        lineId: line.id!,
        isChain: line.isChain,
      }),
    ),
    ...commands,
  ];

  // Without setStartingPose, start where the first path does. Poses written
  // as just (x, y) have no heading, so give those a neutral one.
  const start = startPoint ?? lines[0]?.startPoint ?? defaultStartPoint();
  return {
    startPoint: (start as Partial<Point>).heading
      ? { ...start }
      : { ...defaultStartPoint(), x: start.x, y: start.y },
    lines,
    sequence,
    shapes: [],
  };
}
