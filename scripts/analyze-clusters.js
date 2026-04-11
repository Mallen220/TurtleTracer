// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs";

const report = JSON.parse(
  fs.readFileSync("tmp/jscpd/jscpd-report.json", "utf-8"),
);
const duplicates = report.duplicates || [];

// Group duplicates into clusters where all members are clones of each other.
// jscpd reports pairs (A,B). If we have A==B and B==C, we have a cluster {A,B,C}.
const clusters = [];

duplicates.forEach(({ firstFile, secondFile }) => {
  const loc1 = `${firstFile.name}:${firstFile.startLoc.line}-${firstFile.endLoc.line}`;
  const loc2 = `${secondFile.name}:${secondFile.startLoc.line}-${secondFile.endLoc.line}`;

  let cluster1 = clusters.find((c) => c.has(loc1));
  let cluster2 = clusters.find((c) => c.has(loc2));

  if (cluster1 && cluster2) {
    if (cluster1 !== cluster2) {
      // Merge clusters
      cluster2.forEach((loc) => cluster1.add(loc));
      clusters.splice(clusters.indexOf(cluster2), 1);
    }
  } else if (cluster1) {
    cluster1.add(loc2);
  } else if (cluster2) {
    cluster2.add(loc1);
  } else {
    clusters.push(new Set([loc1, loc2]));
  }
});

let totalClones = 0;
clusters.forEach((c) => (totalClones += c.size));

console.log(`Total clones (clustered): ${totalClones}`);
console.log(`Number of clusters: ${clusters.length}`);
