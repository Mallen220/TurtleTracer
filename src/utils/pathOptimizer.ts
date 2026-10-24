// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Collision checking along a timed path, and a genetic optimizer that moves
// control points to find the fastest path that doesn't collide.
import type {
  BasePoint,
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  TimelineEvent,
  CollisionMarker,
} from "../types";
import { calculatePathTime, type TimeOptions } from "./timeCalculator";
import { FIELD_SIZE } from "../config";
import { pointInPolygon, polygonsOverlap, getRobotCorners } from "./geometry";
import { getCurvePoint } from "./math";
import { robotPoseDuring, type RobotState as Pose } from "./animation";

export interface OptimizerOptions {
  /**
   * Whether to time chained paths with the robot handed over early and
   * swinging wide at the corners. Turn off to optimize as if it followed each
   * path exactly. On by default.
   */
  chainCorrection?: boolean;
}

export interface OptimizationResult {
  generation: number;
  bestTime: number;
  bestLines: Line[];
}

/** `time` is what's shown; `cost` is what candidates are ranked by. */
type Candidate = { lines: Line[]; time: number; cost: number };
type Box = { minX: number; maxX: number; minY: number; maxY: number };

/** How often (in seconds of path time) the robot's pose is checked. */
const CHECK_INTERVAL = 0.2;
/** Fitness of a path that collides; the collision count is added to it. */
const COLLISION_PENALTY = 10000;
/**
 * Added to the cost of a path whose robot only collides while it swings off
 * the path at a chained corner. That swing is an estimate, so it ranks the
 * path below clean ones without ruling it out.
 */
const SWING_COLLISION_PENALTY = 30;
/**
 * A chained corner is cut when the next path takes over early. Cutting it so
 * that the robot misses the point the paths join at by more than this many
 * inches costs this many seconds per extra inch, so the optimizer can't gain
 * time by skipping a point the path is meant to pass through.
 */
const MISS_TOLERANCE = 3;
const MISS_PENALTY_PER_INCH = 3;
/**
 * Missing a join by less than the tolerance still costs a little, so the
 * optimizer doesn't settle right at the edge of it (it would otherwise skip
 * every join by just under three inches).
 */
const MISS_COST_PER_INCH = 0.1;
/**
 * Tie-breakers. Cost is time, so a bend or control point that changes nothing
 * costs nothing, and the search adds them at random and keeps them. These make
 * a path with no reason to be longer or more complicated rank a little below
 * the plain one. They are small next to a real gain in time (a tenth of a
 * second), and never change the time that is shown.
 */
const CONTROL_POINT_COST = 0.03;
const LENGTH_COST_PER_INCH = 0.002;
/**
 * When finishing, a control point is dropped if the path ranks no more than
 * this many seconds worse without it.
 */
const SIMPLIFY_TOLERANCE = 0.05;
/** Every this-many'th candidate of the starting population changes a lot, even if nothing collides. */
const WILD_EVERY = 4;
/**
 * With nothing in the way, a control point stays within this share of its
 * path's reach (how far its curve spreads) of where it started, and at least
 * the minimum, in inches. The path being improved is the user's own: it is
 * refined, not redrawn.
 */
const TRUST_FRACTION = 0.3;
const TRUST_MIN_RADIUS = 20;
/** Paths that start with fewer than this many control points may gain up to it. */
const FREE_CONTROL_POINTS = 2;
/**
 * A path that already clips the field edge (at a point it can't move, say)
 * isn't punished for those samples, but each costs this many seconds, so
 * clipping less is still better.
 */
const BOUNDARY_SAMPLE_COST = 1;
/**
 * An optimized path must be better than the original by this much (seconds of
 * cost, after what moving the paths costs) to replace it. A change that saves
 * a few tenths of a second isn't worth redrawing a path for.
 */
const IMPROVEMENT_EPSILON = 0.15;
/**
 * What moving a path from where it was costs, in seconds per inch it is moved
 * (measured as how far apart the old and new curves are, on average). Without
 * it, a change that saves a hundredth of a second costs nothing to make, and
 * the paths are redrawn for no reason. A change that really fixes something,
 * such as a bend the robot can't follow, saves seconds for a few inches.
 */
const DEVIATION_COST_PER_INCH = 0.1;
/** How many points along a path its distance from the original is measured at. */
const DEVIATION_SAMPLES = 10;
/**
 * When finishing, a path is put back as it was if that costs no more than this
 * many seconds (net of what moving it costs): its change isn't worth it.
 */
const REVERT_TOLERANCE = 0.1;
/** Fitness of a path that can't be timed at all. */
const INVALID_PENALTY = 20000;
/** Control points are kept at least this far (inches) from line ends. */
const MIN_CONTROL_POINT_GAP = 10;
/** Slack allowed past the field edge before it counts as leaving. */
const BOUNDARY_EPSILON = 0.05;

const clampToField = (v: number) => Math.max(0, Math.min(FIELD_SIZE, v));

function boundingBox(shape: Shape): Box {
  const xs = shape.vertices.map((v) => v.x);
  const ys = shape.vertices.map((v) => v.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** A box of half-size `r` around (x, y). */
const boxAround = (x: number, y: number, r: number): Box => ({
  minX: x - r,
  maxX: x + r,
  minY: y - r,
  maxY: y + r,
});

const boxesOverlap = (a: Box, b: Box) =>
  a.maxX >= b.minX && a.minX <= b.maxX && a.maxY >= b.minY && a.minY <= b.maxY;

const isOutsideField = (p: BasePoint) =>
  p.x < -BOUNDARY_EPSILON ||
  p.x > FIELD_SIZE + BOUNDARY_EPSILON ||
  p.y < -BOUNDARY_EPSILON ||
  p.y > FIELD_SIZE + BOUNDARY_EPSILON;

const isValidPoint = (p: { x?: number; y?: number } | undefined) =>
  Number.isFinite(p?.x) && Number.isFinite(p?.y);

/** How many of the checks (see CHECK_INTERVAL) a marker covers: at least one. */
const collisionSamples = (m: CollisionMarker) =>
  1 + Math.round(((m.endTime ?? m.time) - m.time) / CHECK_INTERVAL);

/** Moves `point` out to `gap` inches from `anchor` if it's closer. */
function keepAwayFrom(
  point: BasePoint,
  anchor: BasePoint,
  gap: number,
  nudgeX: number,
) {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= gap) return;
  if (dist < 0.0001) {
    // On top of each other: there's no direction to push along.
    point.x += nudgeX;
  } else {
    point.x = anchor.x + (dx * gap) / dist;
    point.y = anchor.y + (dy * gap) / dist;
  }
}

export class PathOptimizer {
  private startPoint: Point;
  private originalLines: Line[];
  private settings: Settings;
  private timeOptions: TimeOptions;
  private sequence: SequenceItem[];
  private shapes: Shape[];
  private obstacles: { shape: Shape; box: Box }[];
  private keepInZones: { shape: Shape; box: Box }[];

  private populationSize: number;
  private generations: number;
  private mutationRate: number;
  /** Largest distance (inches) a mutation moves a control point. */
  private mutationStrength: number;
  private stopRequested = false;
  /** With no obstacles or keep-in zones, the search stays close to the path it was given. */
  private readonly local: boolean;
  /** For each line: where its control points started, and how far they may move from there. */
  private readonly anchors: {
    points: BasePoint[];
    middle: BasePoint;
    radius: number;
  }[];
  /** Samples of the original path that already leave the field, which aren't held against a candidate. */
  private baselineBoundary = 0;
  /** Points along each original path, to measure how far a candidate has moved it. */
  private readonly originalSamples: BasePoint[][];

  constructor(
    startPoint: Point,
    lines: Line[],
    settings: Settings,
    sequence: SequenceItem[],
    shapes: Shape[] = [],
    options: OptimizerOptions = {},
  ) {
    this.startPoint = structuredClone(startPoint);
    this.originalLines = structuredClone(lines);
    this.settings = settings;
    this.timeOptions = { chainCorrection: options.chainCorrection };
    this.sequence = sequence;
    this.shapes = shapes;

    const polygons = shapes
      .filter((s) => s.vertices.length >= 3)
      .map((shape) => ({ shape, box: boundingBox(shape) }));
    this.obstacles = polygons.filter((p) => p.shape.type !== "keep-in");
    this.keepInZones = polygons.filter((p) => p.shape.type === "keep-in");

    this.local = this.obstacles.length + this.keepInZones.length === 0;
    this.anchors = this.originalLines.map((line, i) => {
      const from =
        i === 0 ? this.startPoint : this.originalLines[i - 1].endPoint;
      const to = line.endPoint;
      const reach = Math.max(
        Math.hypot(to.x - from.x, to.y - from.y),
        ...line.controlPoints.map((c) =>
          Math.max(
            Math.hypot(c.x - from.x, c.y - from.y),
            Math.hypot(c.x - to.x, c.y - to.y),
          ),
        ),
      );
      return {
        points: line.controlPoints.map((c) => ({ x: c.x, y: c.y })),
        middle: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 },
        radius: Math.max(TRUST_MIN_RADIUS, TRUST_FRACTION * reach),
      };
    });

    this.originalSamples = this.originalLines.map((line, i) =>
      this.sampleCurve(i, line),
    );

    this.generations = settings.optimizationIterations ?? 100;
    this.populationSize = settings.optimizationPopulationSize ?? 50;
    this.mutationRate = settings.optimizationMutationRate ?? 0.4;
    this.mutationStrength = settings.optimizationMutationStrength ?? 6;
  }

  /** Asks a running optimize() to finish after the current generation. */
  public stop() {
    this.stopRequested = true;
  }

  // --- Collision checking ---

  /**
   * Stretches of the path where the robot hits an obstacle, leaves the
   * field, or leaves every keep-in zone. Without a timeline, the original
   * path is timed first.
   */
  public getCollisions(
    timeline: TimelineEvent[] | null = null,
    lines: Line[] | null = null,
  ): CollisionMarker[] {
    const { settings } = this;
    const checkBoundaries = settings.validateFieldBoundaries !== false;
    if (settings.validationDisabled) return [];
    if (
      !checkBoundaries &&
      this.obstacles.length + this.keepInZones.length === 0
    ) {
      return [];
    }

    if (!timeline || !lines) {
      lines ??= this.originalLines;
      timeline = calculatePathTime(
        this.startPoint,
        lines,
        settings,
        this.sequence,
        this.timeOptions,
      ).timeline;
    }

    // Macro events wrap the travel and wait events inside them.
    const events = (timeline ?? []).filter((ev) => ev.type !== "macro");
    const totalTime = events.at(-1)?.endTime;
    if (totalTime === undefined || !Number.isFinite(totalTime)) return [];

    // Near the start the robot may begin flush against a wall, so the field
    // edge isn't checked until it has moved clear.
    const margin = settings.safetyMargin || 0;
    const reach = this.paddedHalfDiagonal();
    const startClearance = Math.max(2, margin * 2, reach + 0.1);

    const markers: CollisionMarker[] = [];
    let current = null as CollisionMarker | null;
    let eventIdx = 0;

    for (let t = 0; t <= totalTime; t += CHECK_INTERVAL) {
      while (eventIdx < events.length - 1 && t > events[eventIdx].endTime) {
        eventIdx++;
      }
      const event = events[eventIdx];
      const pose = robotPoseDuring(event, t, lines, this.startPoint);
      if (!pose) continue;

      const distToStart = Math.hypot(
        pose.x - this.startPoint.x,
        pose.y - this.startPoint.y,
      );
      if (
        checkBoundaries &&
        event.lineIndex === 0 &&
        distToStart <= startClearance * 1.5
      ) {
        continue;
      }

      const type = this.collisionAt(
        pose,
        checkBoundaries && distToStart > startClearance,
      );
      if (!type) {
        if (current) markers.push(current);
        current = null;
        continue;
      }

      // One marker per stretch of the same kind of collision on one segment.
      const segment =
        event.type === "travel" || event.type === "recovery"
          ? event.lineIndex
          : undefined;
      // Off the path at a corner, or round a bend too fast to follow it.
      const wide = event.excursion;
      const sinceWide = wide ? t - event.startTime - wide.startTime : -1;
      const offPath =
        event.type === "recovery" ||
        (wide !== undefined && sinceWide >= 0 && sinceWide <= wide.duration);
      if (
        current?.type === type &&
        current.segmentEndIndex === segment &&
        !!current.offPath === offPath
      ) {
        current.endTime = t;
        current.endX = pose.x;
        current.endY = pose.y;
      } else {
        if (current) markers.push(current);
        current = {
          x: pose.x,
          y: pose.y,
          time: t,
          segmentIndex: segment,
          type,
          ...(offPath ? { offPath } : {}),
          endTime: t,
          endX: pose.x,
          endY: pose.y,
          segmentEndIndex: segment,
        };
      }
    }

    if (current) markers.push(current);
    return markers;
  }

  private paddedHalfDiagonal() {
    const margin = this.settings.safetyMargin || 0;
    return Math.hypot(
      (this.settings.rLength + margin * 2) / 2,
      (this.settings.rWidth + margin * 2) / 2,
    );
  }

  /** What the robot collides with at `pose`, if anything. */
  private collisionAt(
    { x, y, heading }: Pose,
    checkBoundaries: boolean,
  ): CollisionMarker["type"] | null {
    const { rLength, rWidth } = this.settings;
    const margin = this.settings.safetyMargin || 0;

    // The robot with its safety margin, and a box that contains it at any
    // heading for quick rejection.
    const reach = boxAround(x, y, this.paddedHalfDiagonal());
    let padded: BasePoint[] | null = null;
    const paddedCorners = () =>
      (padded ??= getRobotCorners(
        x,
        y,
        heading,
        rLength + margin * 2,
        rWidth + margin * 2,
      ));

    if (
      checkBoundaries &&
      (reach.minX < -BOUNDARY_EPSILON ||
        reach.maxX > FIELD_SIZE + BOUNDARY_EPSILON ||
        reach.minY < -BOUNDARY_EPSILON ||
        reach.maxY > FIELD_SIZE + BOUNDARY_EPSILON) &&
      paddedCorners().some(isOutsideField)
    ) {
      return "boundary";
    }

    for (const { shape, box } of this.obstacles) {
      if (!boxesOverlap(reach, box)) continue;
      if (polygonsOverlap(paddedCorners(), shape.vertices)) return "obstacle";
    }

    // Keep-in zones ignore the safety margin: the robot itself must be
    // entirely inside at least one of them.
    if (this.keepInZones.length > 0) {
      const body = boxAround(x, y, Math.hypot(rLength / 2, rWidth / 2));
      let corners: BasePoint[] | null = null;
      const inside = this.keepInZones.some(({ shape, box }) => {
        if (!boxesOverlap(body, box)) return false;
        corners ??= getRobotCorners(x, y, heading, rLength, rWidth);
        return corners.every((c) => pointInPolygon([c.x, c.y], shape.vertices));
      });
      if (!inside) return "keep-in";
    }

    return null;
  }

  // --- Optimization ---

  /**
   * Lower cost is better. A path's cost is its time in seconds; a path that
   * collides gets a penalty (more collisions, higher penalty), and so does
   * one that can't be timed. A path that only collides while the robot swings
   * off it at a chained corner costs extra but keeps its real time.
   */
  private score(lines: Line[]): { time: number; cost: number } {
    const result = calculatePathTime(
      this.startPoint,
      lines,
      this.settings,
      this.sequence,
      this.timeOptions,
    );
    if (!Number.isFinite(result.totalTime)) {
      return { time: INVALID_PENALTY, cost: INVALID_PENALTY };
    }

    // Count samples in collision: each marker covers at least one.
    let collisions = 0;
    let boundary = 0;
    let swingCollisions = 0;
    for (const m of this.getCollisions(result.timeline, lines)) {
      const samples = collisionSamples(m);
      if (m.offPath) swingCollisions += samples;
      else if (m.type === "boundary") boundary += samples;
      else collisions += samples;
    }
    // Leaving the field is only held against a path beyond what the original
    // already does.
    if (boundary > this.baselineBoundary) collisions += boundary;
    if (collisions > 0) {
      const penalty = COLLISION_PENALTY + collisions;
      return { time: penalty, cost: penalty };
    }
    const swing =
      swingCollisions > 0 ? SWING_COLLISION_PENALTY + swingCollisions : 0;
    let skipped = 0;
    let missed = 0;
    for (const ev of result.timeline) {
      if (ev.type === "recovery" && ev.missedBy !== undefined) {
        skipped += Math.max(0, ev.missedBy - MISS_TOLERANCE);
        missed += ev.missedBy;
      }
    }
    const controlPoints = lines.reduce(
      (count, line) => count + line.controlPoints.length,
      0,
    );
    return {
      time: result.totalTime,
      cost:
        result.totalTime +
        swing +
        skipped * MISS_PENALTY_PER_INCH +
        missed * MISS_COST_PER_INCH +
        controlPoints * CONTROL_POINT_COST +
        result.totalDistance * LENGTH_COST_PER_INCH +
        boundary * BOUNDARY_SAMPLE_COST +
        this.deviation(lines) * DEVIATION_COST_PER_INCH,
    };
  }

  /** Points along line `i` of a set of lines, which start where the path before it ends. */
  private sampleCurve(i: number, line: Line): BasePoint[] {
    const from = i === 0 ? this.startPoint : this.originalLines[i - 1].endPoint;
    const curve = [from, ...line.controlPoints, line.endPoint];
    return Array.from({ length: DEVIATION_SAMPLES }, (_, j) =>
      getCurvePoint((j + 1) / DEVIATION_SAMPLES, curve),
    );
  }

  /** How far (inches, summed over the paths) `lines` have moved the paths from where they started. */
  private deviation(lines: Line[]): number {
    let total = 0;
    lines.forEach((line, i) => {
      if (line.locked) return;
      const was = this.originalSamples[i];
      const now = this.sampleCurve(i, line);
      let sum = 0;
      for (let j = 0; j < now.length; j++) {
        sum += Math.hypot(now[j].x - was[j].x, now[j].y - was[j].y);
      }
      total += sum / now.length;
    });
    return total;
  }

  private candidate(lines: Line[]): Candidate {
    return { lines, ...this.score(lines) };
  }

  /** A randomly changed copy of `lines`. Colliding paths change more. */
  private mutate(lines: Line[], isColliding: boolean = false): Line[] {
    const newLines = structuredClone(lines);
    const rate = isColliding
      ? Math.min(0.8, this.mutationRate * 2)
      : this.mutationRate;
    // Big jumps give a colliding path a chance to get past the obstacle.
    const strength = isColliding
      ? this.mutationStrength * 5
      : this.mutationStrength;
    const structuralChance = isColliding ? 0.3 : 0.05;

    let prevPoint: BasePoint = this.startPoint;
    for (const [lineIndex, line] of newLines.entries()) {
      const lineStart = prevPoint;
      prevPoint = line.endPoint;
      if (line.locked) continue;
      const cps = line.controlPoints;
      const anchor = this.anchors[lineIndex];
      // With nothing in the way, a path doesn't gain more than a bend or two
      // on top of what it has.
      const mostControlPoints = this.local
        ? Math.max(FREE_CONTROL_POINTS, anchor?.points.length ?? 0)
        : 3;

      // Occasionally add or remove a control point.
      if (Math.random() < structuralChance) {
        if (cps.length < mostControlPoints && Math.random() < 0.6) {
          const jitter = strength * (isColliding ? 4 : 2);
          cps.splice(Math.floor(cps.length / 2), 0, {
            x: clampToField(
              (lineStart.x + line.endPoint.x) / 2 +
                (Math.random() - 0.5) * jitter,
            ),
            y: clampToField(
              (lineStart.y + line.endPoint.y) / 2 +
                (Math.random() - 0.5) * jitter,
            ),
          });
        } else if (cps.length > 0 && Math.random() < 0.3) {
          cps.splice(Math.floor(Math.random() * cps.length), 1);
        }
      }

      for (const [j, cp] of cps.entries()) {
        if (Math.random() < rate) {
          cp.x = clampToField(cp.x + (Math.random() - 0.5) * strength);
          cp.y = clampToField(cp.y + (Math.random() - 0.5) * strength);
        }
        // Stay near where this control point started (or the path's middle,
        // for a new one).
        if (this.local && anchor) {
          const from =
            anchor.points[Math.min(j, anchor.points.length - 1)] ??
            anchor.middle;
          const dx = cp.x - from.x;
          const dy = cp.y - from.y;
          const away = Math.hypot(dx, dy);
          if (away > anchor.radius) {
            cp.x = from.x + (dx * anchor.radius) / away;
            cp.y = from.y + (dy * anchor.radius) / away;
          }
        }
      }

      if (cps.length > 0) {
        keepAwayFrom(
          cps[0],
          lineStart,
          MIN_CONTROL_POINT_GAP,
          MIN_CONTROL_POINT_GAP,
        );
        keepAwayFrom(
          cps.at(-1)!,
          line.endPoint,
          MIN_CONTROL_POINT_GAP,
          -MIN_CONTROL_POINT_GAP,
        );
      }
    }
    return newLines;
  }

  /**
   * Whether the path can't be fixed by moving control points: its start or
   * end points are invalid or already colliding.
   */
  private hasImpossibleFixedPoints(): boolean {
    const fixedPoints: Point[] = [
      this.startPoint,
      ...this.originalLines.map((l) => l.endPoint),
    ];
    if (!fixedPoints.every(isValidPoint)) return true;

    // Check each fixed point as a short stop. The start point gets a line
    // index of -1 so it doesn't get the usual allowance near the start.
    const stops: TimelineEvent[] = fixedPoints.map((p, i) => {
      let heading = 0;
      if (p.heading === "constant") heading = p.degrees;
      else if (p.heading === "linear") heading = p.endDeg;
      return {
        type: "wait",
        duration: CHECK_INTERVAL,
        startTime: i * CHECK_INTERVAL,
        endTime: (i + 1) * CHECK_INTERVAL,
        atPoint: p,
        startHeading: heading,
        targetHeading: heading,
        lineIndex: i - 1,
      };
    });
    return this.getCollisions(stops, this.originalLines).length > 0;
  }

  /**
   * Candidates with one control point added at each point of a coarse grid,
   * kept if they don't collide. Only used when there are obstacles.
   */
  private gridSeeds(): Candidate[] {
    const seeds: Candidate[] = [];
    const step = FIELD_SIZE / 8;
    for (let x = step / 2; x < FIELD_SIZE; x += step) {
      for (let y = step / 2; y < FIELD_SIZE; y += step) {
        const lines = structuredClone(this.originalLines);
        const editable = lines.filter(
          (l) => !l.locked && l.controlPoints.length === 0,
        );
        if (editable.length === 0) continue;
        for (const line of editable) line.controlPoints.push({ x, y });
        const seed = this.candidate(lines);
        if (seed.time < COLLISION_PENALTY) seeds.push(seed);
      }
    }
    return seeds;
  }

  /** Candidates with a control point pushed well off each line's middle. */
  private detourSeeds(count: number): Candidate[] {
    return Array.from({ length: count }, () => {
      const lines = structuredClone(this.originalLines);
      let prevPoint: BasePoint = this.startPoint;
      for (const line of lines) {
        if (!line.locked && line.controlPoints.length < 2) {
          line.controlPoints.push({
            x: clampToField(
              (prevPoint.x + line.endPoint.x) / 2 + (Math.random() - 0.5) * 96,
            ),
            y: clampToField(
              (prevPoint.y + line.endPoint.y) / 2 + (Math.random() - 0.5) * 96,
            ),
          });
        }
        prevPoint = line.endPoint;
      }
      return this.candidate(lines);
    });
  }

  /**
   * Evolves the path's control points to find the fastest path that doesn't
   * collide. `onUpdate` is called with the best path after each generation.
   */
  public async optimize(
    onUpdate: (result: OptimizationResult) => void,
  ): Promise<{
    lines: Line[];
    bestTime: number;
    /** False if nothing was found that is worth changing the path for, which is then what `lines` is. */
    improved?: boolean;
    /** How many seconds faster the best path found was (counting what isn't used when it isn't worth it). */
    gain?: number;
    stopped?: boolean;
    error?: string;
  }> {
    this.stopRequested = false;

    const initialTime = calculatePathTime(
      this.startPoint,
      this.originalLines,
      this.settings,
      this.sequence,
      this.timeOptions,
    ).totalTime;
    if (this.hasImpossibleFixedPoints() || !Number.isFinite(initialTime)) {
      return {
        lines: this.originalLines,
        bestTime: INVALID_PENALTY,
        error: "No valid path found",
      };
    }

    this.baselineBoundary = this.measureBoundaryBaseline();
    const original = this.candidate(this.originalLines);
    let population: Candidate[] = [original];
    if (this.shapes.length > 0) {
      population.push(
        ...this.gridSeeds(),
        ...this.detourSeeds(Math.min(20, this.populationSize)),
      );
    }
    // A path that works is explored carefully, with some wild candidates for
    // variety; one that collides needs big changes to get anywhere.
    const originalCollides = population[0].time >= COLLISION_PENALTY;
    while (population.length < this.populationSize) {
      const wild = originalCollides || population.length % WILD_EVERY === 0;
      population.push(this.candidate(this.mutate(this.originalLines, wild)));
    }

    const byCost = (a: Candidate, b: Candidate) => a.cost - b.cost;
    let lastYield = performance.now();

    for (let gen = 0; gen < this.generations; gen++) {
      population.sort(byCost);
      onUpdate({
        generation: gen + 1,
        bestTime: population[0].time,
        bestLines: population[0].lines,
      });

      // Give the UI a chance to repaint.
      if (performance.now() - lastYield > 15) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
      if (this.stopRequested) break;

      // Keep the best 20%; fill the rest with mutations of the best half.
      const next = population.slice(0, Math.floor(this.populationSize * 0.2));
      const parents = population.slice(
        0,
        Math.floor(this.populationSize * 0.5),
      );
      while (next.length < this.populationSize) {
        const parent =
          parents[Math.floor(Math.random() * parents.length)] ?? population[0];
        next.push(
          this.candidate(
            this.mutate(parent.lines, parent.time > COLLISION_PENALTY),
          ),
        );
      }
      population = next;
    }

    population.sort(byCost);
    const best = this.revertIdleChanges(this.simplify(population[0]));
    // A path that is already about as fast as it gets, or that could only be
    // made a little faster by redrawing it, is left as it is.
    if (best.cost >= original.cost - IMPROVEMENT_EPSILON) {
      return {
        lines: this.originalLines,
        bestTime: original.time,
        improved: false,
        gain: Math.max(0, original.time - best.time),
        stopped: this.stopRequested,
      };
    }
    return {
      lines: best.lines,
      bestTime: best.time,
      improved: true,
      gain: Math.max(0, original.time - best.time),
      stopped: this.stopRequested,
    };
  }

  /**
   * Puts a path back as it was, if the change to it isn't worth what it does to
   * the path. The search changes every path a little at once, and some of those
   * changes save next to nothing. The path whose change is worth least goes
   * back first, until every change left is worth keeping.
   */
  private revertIdleChanges(best: Candidate): Candidate {
    let current = best;
    for (;;) {
      let next: Candidate | null = null;
      for (let l = 0; l < current.lines.length; l++) {
        const was = this.originalLines[l].controlPoints;
        const now = current.lines[l].controlPoints;
        if (
          current.lines[l].locked ||
          (now.length === was.length &&
            now.every((c, j) => c.x === was[j].x && c.y === was[j].y))
        ) {
          continue;
        }
        const trial = structuredClone(current.lines);
        trial[l].controlPoints = structuredClone(was);
        const candidate = this.candidate(trial);
        if (
          candidate.time < COLLISION_PENALTY &&
          candidate.cost <= current.cost + REVERT_TOLERANCE &&
          (!next || candidate.cost < next.cost)
        ) {
          next = candidate;
        }
      }
      if (!next) return current;
      current = next;
    }
  }

  /** How many samples of the original path leave the field (see `baselineBoundary`). */
  private measureBoundaryBaseline(): number {
    return this.getCollisions(null, this.originalLines)
      .filter((m) => m.type === "boundary" && !m.offPath)
      .reduce((count, m) => count + collisionSamples(m), 0);
  }

  /**
   * Drops the control points that aren't earning their place: the search keeps
   * any it happened to add that did no harm. Each one is tried out, and goes
   * if the path ranks about as well without it.
   */
  private simplify(best: Candidate): Candidate {
    let current = best;
    for (let again = true; again; ) {
      again = false;
      for (let l = current.lines.length - 1; l >= 0 && !again; l--) {
        const line = current.lines[l];
        if (line.locked) continue;
        for (let c = line.controlPoints.length - 1; c >= 0; c--) {
          const trial = structuredClone(current.lines);
          trial[l].controlPoints.splice(c, 1);
          const next = this.candidate(trial);
          if (
            next.time < COLLISION_PENALTY &&
            next.cost <= current.cost + SIMPLIFY_TOLERANCE
          ) {
            current = next;
            again = true;
            break;
          }
        }
      }
    }
    return current;
  }
}
