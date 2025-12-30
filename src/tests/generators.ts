import { existsSync } from "fs";
import path from "path";
import { createRequire } from "module";

// Only attempt to import fast-check if it's actually installed to avoid Vite
// import-analysis failures when optional dev deps are missing.
const fastCheckInstalled = existsSync(
  path.join(process.cwd(), "node_modules", "fast-check"),
);

const require = createRequire(import.meta.url);
let fc: any = null;
if (fastCheckInstalled) {
  fc = require("fast-check");
} else {
  // fast-check not available; export minimal placeholders so modules can import safely.
  // The fuzz tests will be skipped when fast-check is absent.
  fc = {
    float: () => ({}),
    option: () => ({}),
    boolean: () => ({}),
    record: () => ({}),
    oneof: () => ({}),
    constant: (v: any) => v,
    array: () => ({}),
    string: () => ({ map: (_fn: any) => ({}) }),
    uuid: () => ({}),
  } as any;
}
import type { Point, Line, BasePoint, ControlPoint } from "../types";

// Generate a valid finite number within a reasonable range to avoid extreme float precision issues
// FTC field is 144 inches. We test up to 100,000 to cover zooms/pans/edge cases without hitting e+30.
export const validNumber = fc.float
  ? fc.float({
      min: -100000,
      max: 100000,
      noNaN: true,
      noDefaultInfinity: true,
    })
  : ({} as any);

// Common properties for all points
const basePointProps = {
  x: validNumber,
  y: validNumber,
  locked: fc.option ? fc.option(fc.boolean(), { nil: undefined }) : ({} as any),
};

// Generate a BasePoint (used for ControlPoints)
export const basePointArbitrary: any = fc.record
  ? fc.record(basePointProps)
  : ({} as any);

// Generate a Point (Union type based on heading)
export const pointArbitrary: any = fc.oneof
  ? fc.oneof(
      // Linear heading
      fc.record({
        ...basePointProps,
        heading: fc.constant("linear"),
        startDeg: fc.float({ min: -180, max: 180 }),
        endDeg: fc.float({ min: -180, max: 180 }),
        degrees: fc.constant(undefined),
        reverse: fc.constant(undefined),
      }),
      // Constant heading
      fc.record({
        ...basePointProps,
        heading: fc.constant("constant"),
        degrees: fc.float({ min: -180, max: 180 }),
        startDeg: fc.constant(undefined),
        endDeg: fc.constant(undefined),
        reverse: fc.constant(undefined),
      }),
      // Tangential heading
      fc.record({
        ...basePointProps,
        heading: fc.constant("tangential"),
        reverse: fc.boolean(),
        degrees: fc.constant(undefined),
        startDeg: fc.constant(undefined),
        endDeg: fc.constant(undefined),
      }),
    )
  : ({} as any);

// Generate a ControlPoint (alias for BasePoint)
export const controlPointArbitrary: any = basePointArbitrary;

// Custom hex color generator
const hexColorArbitrary = fc.string ? fc.string({ minLength: 6, maxLength: 6 }).map((s: string) => "#" + s) : ({} as any);

// Generate a Line
export const lineArbitrary: any = fc.record
  ? fc.record({
      id: fc.option ? fc.option(fc.uuid(), { nil: undefined }) : ({} as any),
      endPoint: pointArbitrary,
      controlPoints: fc.array ? fc.array(controlPointArbitrary, { minLength: 0, maxLength: 2 }) : ({} as any),
      color: hexColorArbitrary,
      name: fc.option ? fc.option(fc.string(), { nil: undefined }) : ({} as any),
      locked: fc.option ? fc.option(fc.boolean(), { nil: undefined }) : ({} as any),
    })
  : ({} as any);
