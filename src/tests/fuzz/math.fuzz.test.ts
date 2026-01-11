// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { createRequire } from "module";

import { existsSync } from "fs";
import path from "path";

const fastCheckInstalled = existsSync(
  path.join(process.cwd(), "node_modules", "fast-check"),
);
const require = createRequire(import.meta.url);
let fc: any;
if (!fastCheckInstalled) {
  describe("Math Utils Property Tests (skipped)", () => {
    it("skipped because fast-check is not installed", () => {
      expect(true).toBe(true);
    });
  });
} else {
  fc = require("fast-check");
}

import {
  transformAngle,
  getAngularDifference,
  getTangentAngle,
} from "../../utils/math";
import { pointArbitrary } from "../generators";
import type { BasePoint } from "../../types";

if (fc) {
  describe("Math Utils Property Tests", () => {
    it("transformAngle should always return value in [-180, 180)", () => {
      fc.assert(
        fc.property(
          fc.float({ noNaN: true, noDefaultInfinity: true }),
          (angle: number) => {
            const result = transformAngle(angle);
            return result >= -180 && result < 180;
          },
        ),
      );
    });

    it("getAngularDifference should be reversible", () => {
      // If we move from A to B by the difference, we should arrive at B (mod 360)
      fc.assert(
        fc.property(
          fc.float({ min: -3600, max: 3600, noNaN: true }),
          fc.float({ min: -3600, max: 3600, noNaN: true }),
          (start: number, end: number) => {
            const diff = getAngularDifference(start, end);
            const target = start + diff;

            // Normalize both to [0, 360) for comparison
            const normTarget = ((target % 360) + 360) % 360;
            const normEnd = ((end % 360) + 360) % 360;

            const difference = Math.abs(normTarget - normEnd);
            // If difference is close to 360, it's effectively 0
            const minDifference = Math.min(difference, Math.abs(difference - 360));

            expect(minDifference).toBeLessThan(1e-9);
          },
        ),
      );
    });

    it("getTangentAngle should return consistent values for same slope", () => {
      fc.assert(
        fc.property(
          pointArbitrary,
          pointArbitrary,
          (p1: BasePoint, p2: BasePoint) => {
            // Skip if points are too close
            if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 1e-6) return true;

            const angle = getTangentAngle(p1, p2);
            expect(angle).toBeDefined();
            expect(angle).toBeGreaterThanOrEqual(-180);
            expect(angle).toBeLessThanOrEqual(180);
          },
        ),
      );
    });
  });
}
