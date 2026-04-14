const fs = require("fs");

let content = fs.readFileSync("src/utils/timeCalculator.test.ts", "utf8");

content = content.replace(
  /  test\("calculates time for a simple path without motion profile", \(\) => \{\n    const startPoint = \{ x: 0, y: 0, heading: "linear", startDeg: 0 \} as any;\n    const lines = \[\n      \{\n        id: "l1",\n        endPoint: \{ x: 100, y: 0 \},\n        controlPoints: \[\],\n        isChain: false,\n      \},\n    \] as any\[\];\n\n    \/\/ Disable motion profile by omitting maxAcceleration\/maxVelocity\n    const settings = \{ \.\.\.defaultSettings, maxAcceleration: undefined \} as any;/g,
  `  test("calculates time for a simple path without motion profile", () => {
    const { startPoint, lines } = createPathData();
    const settings = { ...defaultSettings, maxAcceleration: undefined } as any;`,
);

content = content.replace(
  /  test\("calculates time using motion profile", \(\) => \{\n    const startPoint = \{ x: 0, y: 0, heading: "linear", startDeg: 0 \} as any;\n    const lines = \[\n      \{\n        id: "l1",\n        endPoint: \{ x: 100, y: 0 \},\n        controlPoints: \[\],\n        isChain: false,\n      \},\n    \] as any\[\];\n\n    const time = calculatePathTime\(startPoint, lines, defaultSettings as any\);/g,
  `  test("calculates time using motion profile", () => {
    const { startPoint, lines } = createPathData();
    const time = calculatePathTime(startPoint, lines, defaultSettings as any);`,
);

content = content.replace(
  /  test\("handles chained paths with proper velocity tracking", \(\) => \{\n    const startPoint = \{ x: 0, y: 0, heading: "linear", startDeg: 0 \} as any;\n    const lines = \[\n      \{ id: "l1", endPoint: \{ x: 50, y: 0 \}, controlPoints: \[\], isChain: true \},\n      \{\n        id: "l2",\n        endPoint: \{ x: 100, y: 0 \},\n        controlPoints: \[\],\n        isChain: false,\n      \},\n    \] as any\[\];\n\n    const sequence = \[\n      \{ kind: "path", lineId: "l1" \},\n      \{ kind: "path", lineId: "l2" \},\n    \] as any\[\];/g,
  `  test("handles chained paths with proper velocity tracking", () => {
    const { startPoint, lines, sequence } = createPathData({
      lines: [
        { id: "l1", endPoint: { x: 50, y: 0 }, controlPoints: [], isChain: true },
        { id: "l2", endPoint: { x: 100, y: 0 }, controlPoints: [], isChain: false }
      ]
    }, "custom", [
      { kind: "path", lineId: "l1" },
      { kind: "path", lineId: "l2" }
    ]);`,
);

content = content.replace(
  /  test\("guards against extremely small aVelocity", \(\) => \{\n    const startPoint = \{ x: 0, y: 0, heading: "linear", startDeg: 0 \} as any;\n    const lines = \[\n      \{\n        id: "l1",\n        endPoint: \{ x: 10, y: 0 \},\n        controlPoints: \[\],\n        isChain: false,\n      \},\n    \] as any\[\];/g,
  `  test("guards against extremely small aVelocity", () => {
    const { startPoint, lines } = createPathData({
      lineOverrides: { endPoint: { x: 10, y: 0 } }
    });`,
);

fs.writeFileSync("src/utils/timeCalculator.test.ts", content);
