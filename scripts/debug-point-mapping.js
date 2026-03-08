// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Simple simulation to reproduce mapping logic between App and WaypointTable
function runScenario() {
  function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  // Create two lines like in the app
  const lineA = { id: "line-a", endPoint: { x: 10, y: 10 }, controlPoints: [] };
  const lineB = { id: "line-b", endPoint: { x: 20, y: 20 }, controlPoints: [] };
  let lines = [lineA, lineB];
  let sequence = [
    { kind: "path", lineId: lineA.id },
    { kind: "path", lineId: lineB.id },
  ];

  // User selects path 2 (lineB)
  let selectedLineId = lineB.id;
  console.log(
    "[scenario] initial lines:",
    lines.map((l) => l.id),
  );
  console.log(
    "[scenario] sequence:",
    sequence.map((s) => s.lineId),
  );
  console.log("[scenario] selectedLineId:", selectedLineId);

  // addControlPoint logic
  const targetId = selectedLineId || lines[lines.length - 1].id;
  const targetLine =
    lines.find((l) => l.id === targetId) || lines[lines.length - 1];
  console.log(
    "[addControlPoint] targetId, targetLineId, lineIndex:",
    targetId,
    targetLine.id,
    lines.findIndex((l) => l.id === targetLine.id),
  );

  targetLine.controlPoints.push({ x: _.random(36, 108), y: _.random(36, 108) });

  // Table mapping
  console.log("\n-- Table rendering (sequence order) --");
  sequence.forEach((item, seqIdx) => {
    if (item.kind === "path") {
      const matching = lines.filter((l) => l.id === item.lineId);
      matching.forEach((line) => {
        const lineIdx = lines.findIndex((l) => l === line);
        console.log(
          `sequence idx ${seqIdx} -> line.id ${line.id} (lineIdx: ${lineIdx})`,
        );
        line.controlPoints.forEach((cp, j) => {
          const cpIndex = [line.endPoint, ...line.controlPoints].findIndex(
            (p) => p === cp,
          );
          const pointId = `point-${lineIdx + 1}-${cpIndex}`;
          console.log("  cp", j, "cpIndex", cpIndex, "pointId", pointId);
        });
      });
    }
  });
}

runScenario();
