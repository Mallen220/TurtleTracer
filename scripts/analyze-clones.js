// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs";

const report = JSON.parse(
  fs.readFileSync("tmp/jscpd/jscpd-report.json", "utf-8"),
);
const duplicates = report.duplicates || [];

// Group duplicates that refer to the same logical block
// We can use the 'fragment' string as a key, but it might be trimmed or slightly different.
// A better way is to see if locations overlap.

// For now, let's just count how many unique locations (file:start:end) are involved in all duplication events.
const uniqueClones = new Set();
duplicates.forEach((d) => {
  uniqueClones.add(
    `${d.firstFile.name}:${d.firstFile.startLoc.line}-${d.firstFile.endLoc.line}`,
  );
  uniqueClones.add(
    `${d.secondFile.name}:${d.secondFile.startLoc.line}-${d.secondFile.endLoc.line}`,
  );
});

console.log(`Unique clone locations found: ${uniqueClones.size}`);
