// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { expect, test, describe } from "vitest";
import {
  analyzePathSegment,
  unwrapAngle,
  calculateRotationTime,
  calculateGlobalChainMeta,
  calculatePathTime,
  formatTime,
  getAnimationDuration,
} from "./timeCalculator";

const defaultSettings = {
  xVelocity: 0,
  yVelocity: 0,
  aVelocity: 1.5,
  kFriction: 0,
  rLength: 10,
  rWidth: 10,
  safetyMargin: 0,
  maxVelocity: 50,
  maxAcceleration: 30,
  maxAngularAcceleration: 3,
  fieldMap: "none",
  theme: "auto",
};

describe("unwrapAngle", () => {
  test("unwraps angle correctly", () => {
    expect(unwrapAngle(10, 0)).toBe(10);
    expect(unwrapAngle(350, 0)).toBe(-10);
    expect(unwrapAngle(10, 360)).toBe(370);
    expect(unwrapAngle(350, 360)).toBe(350);
    expect(unwrapAngle(-10, 0)).toBe(-10);
  });
});

describe("formatTime", () => {
  test("formats simple seconds", () => {
    expect(formatTime(12.345)).toBe("12.345s");
    expect(formatTime(0.5)).toBe("0.500s");
  });

  test("formats minutes and seconds", () => {
    expect(formatTime(65.123)).toBe("1:05.123s");
    expect(formatTime(120)).toBe("2:00.000s");
  });

  test("handles edge cases", () => {
    expect(formatTime(0)).toBe("0.000s");
    expect(formatTime(-5)).toBe("0.000s");
    expect(formatTime(Infinity)).toBe("Infinite");
    expect(formatTime(NaN)).toBe("Infinite");
  });
});

describe("getAnimationDuration", () => {
  test("returns base duration", () => {
    expect(getAnimationDuration(5)).toBe(5000);
  });

  test("applies speed factor", () => {
    expect(getAnimationDuration(5, 2)).toBe(2500);
    expect(getAnimationDuration(5, 0.5)).toBe(10000);
  });
});

describe("analyzePathSegment", () => {
  test("analyzes straight line segment", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 10, y: 0 };
    const controlPoints: { x: number; y: number }[] = [];

    const analysis = analyzePathSegment(start, controlPoints, end, 50, 0);

    expect(analysis.length).toBeCloseTo(10, 2);
    expect(analysis.netRotation).toBe(0);
    expect(analysis.startHeading).toBe(0);
    expect(analysis.steps.length).toBeGreaterThan(0);
  });

  test("analyzes quadratic bezier segment", () => {
    const start = { x: 0, y: 0 };
    const controlPoints = [{ x: 5, y: 5 }];
    const end = { x: 10, y: 0 };

    const analysis = analyzePathSegment(start, controlPoints, end, 50, 0);

    expect(analysis.length).toBeGreaterThan(10); // Curve is longer than straight line
    expect(analysis.steps.length).toBeGreaterThan(0);
  });

  test("analyzes cubic bezier segment", () => {
    const start = { x: 0, y: 0 };
    const controlPoints = [
      { x: 3, y: 5 },
      { x: 7, y: -5 },
    ];
    const end = { x: 10, y: 0 };

    const analysis = analyzePathSegment(start, controlPoints, end, 50, 0);

    expect(analysis.length).toBeGreaterThan(10);
    expect(analysis.steps.length).toBeGreaterThan(0);
  });

  test("handles zero length segment", () => {
    const start = { x: 0, y: 0 };
    const end = { x: 0, y: 0 };

    const analysis = analyzePathSegment(start, [], end, 50, 0);

    expect(analysis.length).toBe(0);
    expect(analysis.steps.length).toBeGreaterThan(0);
  });

  test("adaptive sampling for very short linear segment", () => {
    const startL = { x: 0, y: 0 };
    const endL = { x: 10, y: 10 };
    // This calls analyzePathSegment
    const analysisL = analyzePathSegment(startL, [], endL, 100, 0);

    // Length of (0,0)->(10,10) is sqrt(200) = 14.14
    expect(analysisL.length).toBeCloseTo(14.14, 1);

    // Adaptive samples for linear is 10.
    // Loop runs 0 to 10. So 11 iterations.
    // Steps pushed when i > 0. So 10 steps.
    expect(analysisL.steps.length).toBe(10);
  });

  test("adaptive sampling for short quadratic segment", () => {
    const startQ = { x: 0, y: 0 };
    const endQ = { x: 10, y: 0 };
    const cpsQ = [{ x: 5, y: 10 }];
    const analysisQ = analyzePathSegment(startQ, cpsQ, endQ, 100, 0);

    expect(analysisQ.length).toBeCloseTo(14.78, 1);
    expect(analysisQ.steps.length).toBe(23);
  });

  test("adaptive sampling for long complex segment clamps to max samples", () => {
    const startC = { x: 0, y: 0 };
    const endC = { x: 100, y: 0 };
    const cpsC = [{ x: 50, y: 100 }];
    const analysisC = analyzePathSegment(startC, cpsC, endC, 100, 0);

    expect(analysisC.steps.length).toBe(100);
  });
});

function assertRotationTime(
  diff: number,
  overrides: any = {},
  assertCallback: (time: number) => void,
) {
  const time = calculateRotationTime(diff, {
    ...defaultSettings,
    ...overrides,
  });
  assertCallback(time);
}

describe("calculateRotationTime", () => {
  test("returns 0 for tiny angle diffs", () => {
    expect(calculateRotationTime(0, defaultSettings)).toBe(0);
    expect(calculateRotationTime(0.001, defaultSettings)).toBe(0);
  });

  test("calculates trapezoidal profile with constant velocity phase", () => {
    // Large angle difference where it reaches max velocity
    const time = calculateRotationTime(180, defaultSettings);

    // maxVel = 1.5 rad/s, maxAngAccel = 3 rad/s^2
    // accTime = 1.5 / 3 = 0.5s
    // accDist = 0.5 * 3 * 0.5^2 = 0.375 rad
    // diffRad = 180 * PI/180 = PI rad (approx 3.14)
    // constDist = PI - 2*0.375 = 2.39 rad
    // constTime = 2.39 / 1.5 = 1.59s
    // total time = 0.5 + 1.59 + 0.5 = 2.59s
    expect(time).toBeCloseTo(2.59, 1);
  });

  test("calculates triangular profile (does not reach max velocity)", () => {
    // Small angle diff that doesn't reach max velocity
    // 30 degrees = approx 0.52 rad
    // accDist needed for max vel = 0.375, so total distance 0.75 rad to reach max
    // 0.52 < 0.75, so it's a triangle
    const time = calculateRotationTime(30, defaultSettings);
    expect(time).toBeLessThan(1.0); // 2 * sqrt(0.52 / 3) approx 2 * 0.41 = 0.82
    expect(time).toBeGreaterThan(0);
  });

  test("calculates using fallback maxAngularAcceleration when missing or zero", () => {
    assertRotationTime(90, { maxAngularAcceleration: 0 }, (time) => {
      expect(time).toBeGreaterThan(0);
    });
  });

  test("protects against division by zero in fallback logic", () => {
    assertRotationTime(
      90,
      { maxAngularAcceleration: undefined, rWidth: 0, maxAcceleration: 30 },
      (time) => {
        expect(time).toBeGreaterThan(0);
      },
    );
  });
});

function createPathData(
  overrides: any = {},
  seqType: string = "none",
  seqLines: any[] = [],
) {
  const startPoint = {
    x: 0,
    y: 0,
    heading: overrides.heading || "linear",
    startDeg: 0,
    ...overrides.startOverrides,
  } as any;
  const lines = overrides.lines || [
    {
      id: "l1",
      endPoint: { x: 100, y: 0 },
      controlPoints: [],
      isChain: false,
      ...overrides.lineOverrides,
    },
  ];

  let sequence;
  if (seqType === "simple")
    sequence = [{ kind: "path", lineId: "l1" }] as any[];
  else if (seqType === "custom") sequence = seqLines;

  return { startPoint, lines, sequence };
}

describe("calculateGlobalChainMeta", () => {
  test("calculates correct chain meta for single valid path", () => {
    const {
      startPoint,
      lines,
      sequence: seq,
    } = createPathData(
      {
        lineOverrides: { endPoint: { x: 10, y: 0 } },
      },
      "simple",
    );

    const metaMap = calculateGlobalChainMeta(seq!, lines, startPoint);
    const meta = metaMap.get("l1");

    expect(meta).toBeDefined();
    expect(meta?.rootLine.id).toBe("l1");
    expect(meta?.distanceBefore).toBe(0);
    // distance is 10
    expect(meta?.chainTotalLength).toBeCloseTo(10);
  });

  test("calculates correct chain meta for chained paths", () => {
    const {
      startPoint,
      lines,
      sequence: seq,
    } = createPathData(
      {
        lines: [
          {
            id: "l1",
            endPoint: { x: 10, y: 0 },
            controlPoints: [],
            isChain: true,
          },
          {
            id: "l2",
            endPoint: { x: 10, y: 10 },
            controlPoints: [],
            isChain: false,
          },
        ],
      },
      "custom",
      [
        { kind: "path", lineId: "l1", isChain: true },
        { kind: "path", lineId: "l2", isChain: true },
        { kind: "action" },
      ],
    );

    const metaMap = calculateGlobalChainMeta(seq!, lines, startPoint);

    const meta1 = metaMap.get("l1");
    expect(meta1?.rootLine.id).toBe("l1");
    expect(meta1?.distanceBefore).toBe(0);
    expect(meta1?.chainTotalLength).toBeCloseTo(20); // 10 + 10

    const meta2 = metaMap.get("l2");
    expect(meta2?.rootLine.id).toBe("l1"); // L2 roots to L1
    expect(meta2?.distanceBefore).toBeCloseTo(10);
    expect(meta2?.chainTotalLength).toBeCloseTo(20);
  });

  test("ignores unknown sequences or missing endpoints", () => {
    const {
      startPoint,
      lines,
      sequence: seq,
    } = createPathData(
      {
        lines: [{ id: "l1", controlPoints: [] }],
      },
      "custom",
      [
        { kind: "path", lineId: "l1" },
        { kind: "path", lineId: "missing" },
      ],
    );

    const metaMap = calculateGlobalChainMeta(seq!, lines, startPoint);
    expect(metaMap.size).toBe(0);
  });
});

describe("calculatePathTime", () => {
  test("calculates time for a simple path without motion profile", () => {
    const { startPoint, lines } = createPathData();
    const settings = { ...defaultSettings, maxAcceleration: undefined } as any;

    const time = calculatePathTime(startPoint, lines, settings);

    expect(time.totalDistance).toBeCloseTo(100);
    // Since motion profile is off, it may return some nominal time based on fallback distance/time or just 0s.
    // The important part is it doesn't crash and computes distance.
    expect(time.totalTime).toBeGreaterThanOrEqual(0);
    expect(time.timeline.length).toBeGreaterThan(0);
  });

  test("calculates time using motion profile", () => {
    const { startPoint, lines } = createPathData();
    const time = calculatePathTime(startPoint, lines, defaultSettings as any);

    expect(time.totalDistance).toBeCloseTo(100);
    expect(time.totalTime).toBeGreaterThan(0);
    // Rough estimate: max_vel = 50, acc = 30
    // acc_t = 50/30 = 1.66s, acc_d = 0.5 * 30 * 1.66^2 = 41.6
    // Total distance = 100, requires constant vel phase.
    expect(time.segmentTimes.length).toBe(1);
    expect(time.timeline.length).toBeGreaterThan(0);
  });

  test("handles chained paths with proper velocity tracking", () => {
    const { startPoint, lines, sequence } = createPathData(
      {
        lines: [
          {
            id: "l1",
            endPoint: { x: 50, y: 0 },
            controlPoints: [],
            isChain: true,
          },
          {
            id: "l2",
            endPoint: { x: 100, y: 0 },
            controlPoints: [],
            isChain: false,
          },
        ],
      },
      "custom",
      [
        { kind: "path", lineId: "l1" },
        { kind: "path", lineId: "l2" },
      ],
    );

    const time = calculatePathTime(
      startPoint,
      lines,
      defaultSettings as any,
      sequence,
    );

    expect(time.totalDistance).toBeCloseTo(100);
    expect(time.totalTime).toBeGreaterThan(0);
    expect(time.segmentTimes.length).toBe(2);
  });

  test("handles initial heading overrides from global sequence", () => {
    const { startPoint, lines, sequence } = createPathData(
      {
        lineOverrides: { globalHeading: "constant", globalDegrees: 90 },
      },
      "simple",
    );

    const time = calculatePathTime(
      startPoint,
      lines,
      defaultSettings as any,
      sequence,
    );

    expect(time.totalDistance).toBeCloseTo(100);
    expect(time.totalTime).toBeGreaterThan(0);
  });

  test("handles tangent and facing heading overrides", () => {
    const { startPoint, lines, sequence } = createPathData(
      {
        lineOverrides: {
          globalHeading: "facingPoint",
          globalTargetX: 50,
          globalTargetY: 50,
        },
      },
      "simple",
    );

    const time = calculatePathTime(
      startPoint,
      lines,
      defaultSettings as any,
      sequence,
    );

    expect(time.totalDistance).toBeCloseTo(100);
    expect(time.totalTime).toBeGreaterThan(0);
  });

  test("guards against extremely small aVelocity", () => {
    const { startPoint, lines } = createPathData({
      lineOverrides: { endPoint: { x: 10, y: 0 } },
    });

    const settings = { ...defaultSettings, aVelocity: 0 } as any;

    const time = calculatePathTime(startPoint, lines, settings);

    // Shouldn't crash, aVelocity gets clamped to 0.001
    expect(time.totalDistance).toBeCloseTo(10);
    expect(time.totalTime).toBeGreaterThan(0);
  });
});

test("calculatePathTime processes heading loops and handles macros gracefully", () => {
  const { startPoint, lines, sequence } = createPathData(
    {
      heading: "constant",
      startOverrides: { degrees: 0 },
      lineOverrides: { endPoint: { x: 50, y: 0 } },
    },
    "simple",
  );

  const macros = new Map<string, any>();

  // Just trigger the loop
  const time = calculatePathTime(
    startPoint,
    lines,
    defaultSettings as any,
    sequence,
    macros,
  );
  expect(time.totalTime).toBeGreaterThan(0);
});

test("calculatePathTime handles action sequences gracefully", () => {
  const { startPoint, lines, sequence } = createPathData(
    {
      heading: "tangential",
      lineOverrides: { endPoint: { x: 50, y: 0 } },
    },
    "custom",
    [
      { kind: "path", lineId: "l1" },
      { kind: "action", waitTime: 2000 },
    ],
  );

  const time = calculatePathTime(
    startPoint,
    lines,
    defaultSettings as any,
    sequence,
  );

  expect(time.timeline.length).toBeGreaterThan(0); // Timeline gets populated for actions
});

describe("calculatePathTime extra edge cases", () => {
  test("calculatePathTime handles reverse motion", () => {
    const { startPoint, lines } = createPathData({
      lineOverrides: { endPoint: { x: -100, y: 0 }, robotReversed: true },
    });

    const time = calculatePathTime(startPoint, lines, defaultSettings as any);

    expect(time.totalDistance).toBeGreaterThan(0);
    expect(time.totalTime).toBeGreaterThan(0);
  });
});
