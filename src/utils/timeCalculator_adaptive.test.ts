
import { test, expect } from 'vitest';
import { analyzePathSegment } from './timeCalculator';

test('analyzePathSegment adaptive sampling correctness', () => {
    // Linear (Short)
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

    // Quadratic (Short)
    // 0,0 -> 5,10 -> 10,0
    // Control Polygon Length approx 22.36.
    // Adaptive samples ~23.
    // Actual Curve Length ~14.78.
    const startQ = { x: 0, y: 0 };
    const endQ = { x: 10, y: 0 };
    const cpsQ = [{ x: 5, y: 10 }];
    const analysisQ = analyzePathSegment(startQ, cpsQ, endQ, 100, 0);

    expect(analysisQ.length).toBeCloseTo(14.78, 1);

    // Should have fewer than 100 steps
    // Target samples = ceil(22.36 * 1) = 23.
    // Clamped max(20, min(23, 100)) = 23.
    // Steps length = 23.
    expect(analysisQ.steps.length).toBe(23);

    // Complex (Long)
    // 0,0 -> 50,100 -> 100,0
    // Control Polygon Length approx 111.8 + 111.8 = 223.6.
    // Target samples = 224.
    // Clamped max(20, min(224, 100)) = 100.
    const startC = { x: 0, y: 0 };
    const endC = { x: 100, y: 0 };
    const cpsC = [{ x: 50, y: 100 }];
    const analysisC = analyzePathSegment(startC, cpsC, endC, 100, 0);

    expect(analysisC.steps.length).toBe(100);
});
