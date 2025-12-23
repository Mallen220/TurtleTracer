// src/utils/pathOptimizer.ts
import _ from "lodash";
import type { Line, Point, SequenceItem, Settings } from "../types";
import { calculatePathTime } from "./timeCalculator"; // Assuming this is where it's exported
import { FIELD_SIZE } from "../config";

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

  private startPoint: Point;
  private originalLines: Line[];
  private settings: Settings;
  private sequence: SequenceItem[];

  constructor(
    startPoint: Point,
    lines: Line[],
    settings: Settings,
    sequence: SequenceItem[],
  ) {
    this.startPoint = _.cloneDeep(startPoint);
    this.originalLines = _.cloneDeep(lines);
    this.settings = settings;
    this.sequence = sequence;
    // Use settings values if provided, else defaults
    this.generations = settings.optimizationIterations ?? 100;
    this.populationSize = settings.optimizationPopulationSize ?? 50;
    this.mutationRate = settings.optimizationMutationRate ?? 0.4;
    this.mutationStrength = settings.optimizationMutationStrength ?? 6.0;
  }

  // Generate a mutated version of the lines
  private mutate(lines: Line[]): Line[] {
    const newLines = _.cloneDeep(lines);

    newLines.forEach((line) => {
      // Don't mutate locked lines
      if (line.locked) return;

      // Mutate control points
      line.controlPoints.forEach((cp) => {
        if (Math.random() < this.mutationRate) {
          cp.x += (Math.random() - 0.5) * this.mutationStrength;
          cp.y += (Math.random() - 0.5) * this.mutationStrength;

          // Clamp to field bounds
          cp.x = Math.max(0, Math.min(FIELD_SIZE, cp.x));
          cp.y = Math.max(0, Math.min(FIELD_SIZE, cp.y));
        }
      });

      // Optionally mutate endpoint positions (small adjustments)
      // Note: We avoid moving endpoints too much as they usually represent specific game targets
      /*
      if (!line.locked && Math.random() < 0.1) {
         line.endPoint.x += (Math.random() - 0.5) * 2;
         line.endPoint.y += (Math.random() - 0.5) * 2;
         // Clamp...
      }
      */
    });

    return newLines;
  }

  private calculateFitness(lines: Line[]): number {
    const result = calculatePathTime(
      this.startPoint,
      lines,
      this.settings,
      this.sequence,
    );
    return result.totalTime;
  }

  public async optimize(
    onUpdate: (result: OptimizationResult) => void,
  ): Promise<Line[]> {
    // Initialize population
    let population: { lines: Line[]; time: number }[] = [];

    // Add original as the first candidate (Elitism)
    population.push({
      lines: this.originalLines,
      time: this.calculateFitness(this.originalLines),
    });

    // Fill rest of population
    for (let i = 1; i < this.populationSize; i++) {
      const mutated = this.mutate(this.originalLines);
      population.push({
        lines: mutated,
        time: this.calculateFitness(mutated),
      });
    }

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
      await new Promise((resolve) => setTimeout(resolve, 0));

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
        const parent =
          parentPool[Math.floor(Math.random() * parentPool.length)];
        const childLines = this.mutate(parent.lines);
        nextGen.push({
          lines: childLines,
          time: this.calculateFitness(childLines),
        });
      }

      population = nextGen;
    }

    // Return best path
    population.sort((a, b) => a.time - b.time);
    return population[0].lines;
  }
}
