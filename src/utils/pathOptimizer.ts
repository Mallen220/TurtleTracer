// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
// src/utils/pathOptimizer.ts
import _ from "lodash";
import type {
  Line,
  Point,
  SequenceItem,
  Settings,
  Shape,
  TimelineEvent,
  ControlPoint,
  CollisionMarker,
} from "../types";
import { calculatePathTime } from "./timeCalculator";
import { FIELD_SIZE } from "../config";
import { pointInPolygon, getRobotCorners } from "./geometry";
import {
  getCurvePoint,
  easeInOutQuad,
  shortestRotation,
  radiansToDegrees,
} from "./math";

export interface OptimizationResult {
  generation: number;
  bestTime: number;
  bestLines: Line[];
}

export class PathOptimizer {
  private populationSize: number;
  private generations: number;
  private mutationRate: number;
  private mutationStrength: number; // Max inches to move a point
  // Cancellation request flag
  private stopRequested: boolean;
  private startPoint: Point;
  private originalLines: Line[];
  private settings: Settings;
  private sequence: SequenceItem[];
  private shapes: Shape[];
  private activeShapes: Shape[]; // All active shapes
  private activeObstacles: Shape[]; // Only obstacle type
  private activeKeepInZones: Shape[]; // Only keep-in type

  constructor(
    startPoint: Point,
    lines: Line[],
    settings: Settings,
    sequence: SequenceItem[],
    shapes: Shape[] = [],
  ) {
    this.startPoint = _.cloneDeep(startPoint);
    this.originalLines = _.cloneDeep(lines);
    this.settings = settings;
    this.sequence = sequence;
    this.shapes = shapes;
    this.activeShapes = this.shapes.filter((s) => s.vertices.length >= 3);
    this.activeObstacles = this.activeShapes.filter(
      (s) => s.type !== "keep-in",
    );
    this.activeKeepInZones = this.activeShapes.filter(
      (s) => s.type === "keep-in",
    );
    // Use settings values if provided, else defaults
    this.generations = settings.optimizationIterations ?? 100;
    this.populationSize = settings.optimizationPopulationSize ?? 50;
    this.mutationRate = settings.optimizationMutationRate ?? 0.4;
    this.mutationStrength = settings.optimizationMutationStrength ?? 6.0;

    // Cancellation flag
    this.stopRequested = false;
  }

  // Request the optimizer to stop at the next convenient point
  public stop() {
    this.stopRequested = true;
  }

  // Generate a mutated version of the lines
  private mutate(lines: Line[], isColliding: boolean = false): Line[] {
    const newLines = _.cloneDeep(lines);
    const MIN_DIST = 10; // Minimum distance in inches for control points

    let prevPoint = this.startPoint;

    // Adaptive parameters based on collision state
    const adaptiveMutationRate = isColliding
      ? Math.min(0.8, this.mutationRate * 2)
      : this.mutationRate;
    // Drastically increase strength if colliding to jump over obstacles
    const adaptiveMutationStrength = isColliding
      ? this.mutationStrength * 5
      : this.mutationStrength;
    const structuralMutationChance = isColliding ? 0.3 : 0.05;

    newLines.forEach((line) => {
      // Don't mutate locked lines
      if (line.locked) {
        prevPoint = line.endPoint;
        return;
      }

      // Structural Mutation: Add/Remove Control Points
      // Only do this with low probability to maintain stability, unless colliding
      if (Math.random() < structuralMutationChance) {
        if (line.controlPoints.length < 3 && Math.random() < 0.6) {
          // Allow up to 3 points
          // Add a control point at the midpoint of start/end
          const midX = (prevPoint.x + line.endPoint.x) / 2;
          const midY = (prevPoint.y + line.endPoint.y) / 2;

          // Add massive jitter if colliding
          const jitterMult = isColliding ? 4 : 2;
          const jitterX =
            (Math.random() - 0.5) * adaptiveMutationStrength * jitterMult;
          const jitterY =
            (Math.random() - 0.5) * adaptiveMutationStrength * jitterMult;

          const newCP: ControlPoint = {
            x: Math.max(0, Math.min(FIELD_SIZE, midX + jitterX)),
            y: Math.max(0, Math.min(FIELD_SIZE, midY + jitterY)),
          };

          // Insert in middle
          const insertIdx = Math.floor(line.controlPoints.length / 2);
          line.controlPoints.splice(insertIdx, 0, newCP);
        } else if (line.controlPoints.length > 0 && Math.random() < 0.3) {
          // Remove a random control point
          const removeIdx = Math.floor(
            Math.random() * line.controlPoints.length,
          );
          line.controlPoints.splice(removeIdx, 1);
        }
      }

      // Mutate control points
      line.controlPoints.forEach((cp) => {
        if (Math.random() < adaptiveMutationRate) {
          cp.x += (Math.random() - 0.5) * adaptiveMutationStrength;
          cp.y += (Math.random() - 0.5) * adaptiveMutationStrength;

          // Clamp to field bounds
          cp.x = Math.max(0, Math.min(FIELD_SIZE, cp.x));
          cp.y = Math.max(0, Math.min(FIELD_SIZE, cp.y));
        }
      });

      // Enforce minimum distance constraints
      if (line.controlPoints.length > 0) {
        // 1. Check first control point vs prevPoint (start of line)
        const firstCP = line.controlPoints[0];
        let dx = firstCP.x - prevPoint.x;
        let dy = firstCP.y - prevPoint.y;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MIN_DIST) {
          if (dist < 0.0001) {
            firstCP.x += MIN_DIST;
          } else {
            const scale = MIN_DIST / dist;
            firstCP.x = prevPoint.x + dx * scale;
            firstCP.y = prevPoint.y + dy * scale;
          }
        }

        // 2. Check last control point vs endPoint (end of line)
        const lastCP = line.controlPoints[line.controlPoints.length - 1];
        dx = lastCP.x - line.endPoint.x;
        dy = lastCP.y - line.endPoint.y;
        dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MIN_DIST) {
          if (dist < 0.0001) {
            // If identical, move it away (e.g. towards start? or just +x)
            // Just shifting X is safe enough to create distance
            lastCP.x -= MIN_DIST;
          } else {
            const scale = MIN_DIST / dist;
            lastCP.x = line.endPoint.x + dx * scale;
            lastCP.y = line.endPoint.y + dy * scale;
          }
        }
      }

      prevPoint = line.endPoint;
    });

    return newLines;
  }

  // Public wrapper that matches the signature getCollisionCount used internally,
  // but returns detailed CollisionMarkers instead of just a number.
  public getCollisions(
    timeline: TimelineEvent[] | null = null,
    lines: Line[] | null = null,
  ): CollisionMarker[] {
    // If we have no shapes and boundary validation is disabled, we can skip
    if (
      this.activeShapes.length === 0 &&
      this.settings.validateFieldBoundaries === false
    ) {
      return [];
    }

    // If not provided, calculate them (useful for one-off checks)
    if (!timeline || !lines) {
      lines = lines || this.originalLines;
      const result = calculatePathTime(
        this.startPoint,
        lines,
        this.settings,
        this.sequence,
      );
      timeline = result.timeline;
    }

    if (!timeline || timeline.length === 0) return [];

    const lastEvent = timeline[timeline.length - 1];
    if (!lastEvent) return [];

    const totalTime = lastEvent.endTime;
    // Check for NaN totalTime to avoid infinite loop
    if (!Number.isFinite(totalTime)) return [];

    const step = 0.2; // Check every 0.2 seconds for performance
    const markers: CollisionMarker[] = [];
    let currentCollision: CollisionMarker | null = null;

    // Robot dimensions with safety margin
    const rLength =
      this.settings.rLength + (this.settings.safetyMargin || 0) * 2;
    const rWidth = this.settings.rWidth + (this.settings.safetyMargin || 0) * 2;

    let eventIdx = 0;

    for (let t = 0; t <= totalTime; t += step) {
      // Optimized timeline lookup: Advance event index if t exceeds current event end
      while (eventIdx < timeline.length - 1 && t > timeline[eventIdx].endTime) {
        eventIdx++;
      }
      const activeEvent = timeline[eventIdx];
      // Guard against undefined activeEvent if logic slightly off
      if (!activeEvent) break;

      // Inline simplified calculateRobotState logic for performance
      // This avoids O(N) search and function overhead in the hot loop
      let x = 0,
        y = 0,
        heading = 0;

      if (activeEvent.type === "wait") {
        const point = activeEvent.atPoint!;
        x = point.x;
        y = point.y;

        const eventProgress =
          activeEvent.duration > 0
            ? (t - activeEvent.startTime) / activeEvent.duration
            : 1;
        const clampedProgress = Math.max(0, Math.min(1, eventProgress));

        const currentHeading = shortestRotation(
          activeEvent.startHeading!,
          activeEvent.targetHeading!,
          clampedProgress,
        );
        heading = -currentHeading;
      } else {
        const lineIdx = activeEvent.lineIndex!;
        const currentLine = lines[lineIdx];
        if (!currentLine) break; // Should not happen

        const prevPoint =
          lineIdx === 0 ? this.startPoint : lines[lineIdx - 1].endPoint;

        const timeProgress =
          activeEvent.duration > 0
            ? (t - activeEvent.startTime) / activeEvent.duration
            : 1;

        const linePercent = easeInOutQuad(
          Math.max(0, Math.min(1, timeProgress)),
        );

        const curvePoints = [
          prevPoint,
          ...currentLine.controlPoints,
          currentLine.endPoint,
        ];
        const robotInchesXY = getCurvePoint(linePercent, curvePoints);
        x = robotInchesXY.x;
        y = robotInchesXY.y;

        // Calculate Heading
        switch (currentLine.endPoint.heading) {
          case "linear":
            heading = -shortestRotation(
              currentLine.endPoint.startDeg,
              currentLine.endPoint.endDeg,
              linePercent,
            );
            break;
          case "constant":
            heading = -currentLine.endPoint.degrees;
            break;
          case "tangential":
            const nextPointInches = getCurvePoint(
              linePercent + (currentLine.endPoint.reverse ? -0.01 : 0.01),
              curvePoints,
            );
            const dx = nextPointInches.x - x;
            const dy = nextPointInches.y - y;
            if (dx !== 0 || dy !== 0) {
              const angle = Math.atan2(dy, dx);
              heading = radiansToDegrees(angle);
            }
            break;
        }
      }

      const corners = getRobotCorners(x, y, heading, rLength, rWidth);

      let isColliding = false;
      let collisionType: "obstacle" | "boundary" | "keep-in" = "obstacle";

      // 1. Boundary Checks (if enabled)
      if (this.settings.validateFieldBoundaries !== false) {
        // Calculate distance from start point to ignore validation near start
        // This handles cases where safety margin protrudes at start (which is allowed)
        const distToStart = Math.sqrt(
          Math.pow(x - this.startPoint.x, 2) +
            Math.pow(y - this.startPoint.y, 2),
        );
        const exclusionDist = Math.max(
          2,
          (this.settings.safetyMargin || 0) * 2,
        );

        if (distToStart > exclusionDist) {
          const BOUNDARY_EPSILON = 0.05;
          for (const corner of corners) {
            if (
              corner.x < -BOUNDARY_EPSILON ||
              corner.x > FIELD_SIZE + BOUNDARY_EPSILON ||
              corner.y < -BOUNDARY_EPSILON ||
              corner.y > FIELD_SIZE + BOUNDARY_EPSILON
            ) {
              isColliding = true;
              collisionType = "boundary";
              break;
            }
          }
        }
      }

      // 2. Obstacle Checks
      if (!isColliding) {
        for (const shape of this.activeObstacles) {
          // Check if any robot corner is in shape
          for (const corner of corners) {
            if (pointInPolygon([corner.x, corner.y], shape.vertices)) {
              isColliding = true;
              break;
            }
          }
          if (isColliding) break;

          // Also check if any shape vertex is inside the robot
          for (const v of shape.vertices) {
            if (pointInPolygon([v.x, v.y], corners)) {
              isColliding = true;
              break;
            }
          }
          if (isColliding) break;
        }
      }

      // 3. Keep-In Zone Checks
      // Robot must be strictly INSIDE at least one keep-in zone
      if (!isColliding && this.activeKeepInZones.length > 0) {
        // Recalculate corners WITHOUT safety margin
        // Pass full dimensions; getRobotCorners expects full length and calculates extents
        const rawCorners = getRobotCorners(
          x,
          y,
          heading,
          this.settings.rLength,
          this.settings.rWidth,
        );

        let insideAnyZone = false;
        for (const zone of this.activeKeepInZones) {
          let allCornersIn = true;
          for (const corner of rawCorners) {
            if (!pointInPolygon([corner.x, corner.y], zone.vertices)) {
              allCornersIn = false;
              break;
            }
          }
          if (allCornersIn) {
            insideAnyZone = true;
            break;
          }
        }

        if (!insideAnyZone) {
          isColliding = true;
          collisionType = "keep-in";
        }
      }

      if (isColliding) {
        if (currentCollision && currentCollision.type === collisionType) {
          // Extend current collision
          currentCollision.endTime = t;
          currentCollision.endX = x;
          currentCollision.endY = y;
          currentCollision.segmentEndIndex =
            activeEvent.type === "travel" ? activeEvent.lineIndex : undefined;
        } else {
          // Close previous collision if it exists (e.g. type change)
          if (currentCollision) {
            markers.push(currentCollision);
          }
          // Start new collision
          currentCollision = {
            x,
            y,
            time: t,
            segmentIndex:
              activeEvent.type === "travel" ? activeEvent.lineIndex : undefined,
            type: collisionType,
            endTime: t,
            endX: x,
            endY: y,
            segmentEndIndex:
              activeEvent.type === "travel" ? activeEvent.lineIndex : undefined,
          };
        }
      } else {
        if (currentCollision) {
          markers.push(currentCollision);
          currentCollision = null;
        }
      }
    }

    if (currentCollision) {
      markers.push(currentCollision);
    }

    return markers;
  }

  // Backward-compatible method for fitness calculation that returns count only
  private getCollisionCount(timeline: TimelineEvent[], lines: Line[]): number {
    const markers = this.getCollisions(timeline, lines);
    let count = 0;
    const step = 0.2;
    for (const m of markers) {
      // Each marker is at least 1 step
      const duration = (m.endTime ?? m.time) - m.time;
      // Add 1 for the point itself, plus extra steps
      count += 1 + Math.round(duration / step);
    }
    return count;
  }

  private calculateFitness(lines: Line[]): number {
    const result = calculatePathTime(
      this.startPoint,
      lines,
      this.settings,
      this.sequence,
    );
    // If NaN, punish extremely
    if (!Number.isFinite(result.totalTime)) return 20000;

    const collisionCount = this.getCollisionCount(result.timeline, lines);

    if (collisionCount > 0) {
      // Return a large penalty plus the collision count to prioritize fewer collisions
      // Base penalty 10,000 ensures it's much larger than any realistic path time
      // We assume max path time < 100s usually.
      return 10000 + collisionCount;
    }

    return result.totalTime;
  }

  private findValidPathSeeds(): { lines: Line[]; time: number }[] {
    if (!this.shapes || this.shapes.length === 0) return [];

    const validSeeds: { lines: Line[]; time: number }[] = [];
    const gridSize = 8; // 8x8 grid for better coverage (step ~18in)
    const step = FIELD_SIZE / gridSize;

    // Iterate through grid points
    for (let x = step / 2; x < FIELD_SIZE; x += step) {
      for (let y = step / 2; y < FIELD_SIZE; y += step) {
        const seedLines = _.cloneDeep(this.originalLines);
        let modified = false;
        seedLines.forEach((line) => {
          if (!line.locked && line.controlPoints.length < 1) {
            line.controlPoints.push({ x, y });
            modified = true;
          }
        });

        if (modified) {
          const fitness = this.calculateFitness(seedLines);
          if (fitness < 10000) {
            validSeeds.push({ lines: seedLines, time: fitness });
          }
        }
      }
    }

    return validSeeds;
  }

  public async optimize(
    onUpdate: (result: OptimizationResult) => void,
  ): Promise<{ lines: Line[]; bestTime: number; stopped?: boolean }> {
    // Reset cancellation request
    this.stopRequested = false;

    // Initialize population
    let population: { lines: Line[]; time: number }[] = [];

    // Add original as the first candidate (Elitism)
    population.push({
      lines: this.originalLines,
      time: this.calculateFitness(this.originalLines),
    });

    // Try to find valid seeds via grid search
    const validSeeds = this.findValidPathSeeds();
    // Add valid seeds to population
    if (validSeeds.length > 0) {
      population.push(...validSeeds);
    }

    // Smart Initialization: Seed with variants that have extra control points
    if (this.shapes && this.shapes.length > 0) {
      for (let i = 0; i < Math.min(20, this.populationSize); i++) {
        const seedLines = _.cloneDeep(this.originalLines);
        let prevPoint = this.startPoint;

        seedLines.forEach((line) => {
          if (!line.locked && line.controlPoints.length < 2) {
            const midX = (prevPoint.x + line.endPoint.x) / 2;
            const midY = (prevPoint.y + line.endPoint.y) / 2;

            const pushX = (Math.random() - 0.5) * 96;
            const pushY = (Math.random() - 0.5) * 96;

            const newCP: ControlPoint = {
              x: Math.max(0, Math.min(FIELD_SIZE, midX + pushX)),
              y: Math.max(0, Math.min(FIELD_SIZE, midY + pushY)),
            };
            line.controlPoints.push(newCP);
          }
          prevPoint = line.endPoint;
        });

        population.push({
          lines: seedLines,
          time: this.calculateFitness(seedLines),
        });
      }
    }

    // Fill rest of population
    while (population.length < this.populationSize) {
      const mutated = this.mutate(this.originalLines, true);
      population.push({
        lines: mutated,
        time: this.calculateFitness(mutated),
      });
    }

    let lastYieldTime = performance.now();

    // Run generations
    for (let gen = 0; gen < this.generations; gen++) {
      // Sort by time (lowest first)
      population.sort((a, b) => a.time - b.time);

      // Report progress
      onUpdate({
        generation: gen + 1,
        bestTime: population[0].time,
        bestLines: population[0].lines,
      });

      // Allow UI to update
      const now = performance.now();
      if (now - lastYieldTime > 15) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYieldTime = performance.now();
      }

      // If stop was requested, break out early
      if (this.stopRequested) {
        break;
      }

      // Create next generation
      const nextGen: { lines: Line[]; time: number }[] = [];

      // Keep top 20% (Elitism)
      const eliteCount = Math.floor(this.populationSize * 0.2);
      nextGen.push(...population.slice(0, eliteCount));

      // Fill the rest by mutating the top 50%
      const parentPool = population.slice(
        0,
        Math.floor(this.populationSize * 0.5),
      );

      while (nextGen.length < this.populationSize) {
        let parent = parentPool[0]; // Default to best
        if (parentPool.length > 0) {
          parent = parentPool[Math.floor(Math.random() * parentPool.length)];
        }

        // Determine if parent is colliding to adjust mutation aggression
        const isParentColliding = parent.time > 10000;

        const childLines = this.mutate(parent.lines, isParentColliding);
        nextGen.push({
          lines: childLines,
          time: this.calculateFitness(childLines),
        });
      }

      population = nextGen;
    }

    // Return best path and best time (include stopped flag if cancellation requested)
    population.sort((a, b) => a.time - b.time);
    return {
      lines: population[0].lines,
      bestTime: population[0].time,
      stopped: this.stopRequested,
    };
  }
}
