const fs = require('fs');

const p = 'src/utils/engine/index.ts';
let s = fs.readFileSync(p, 'utf8');

// The field expects 'segmentTimes' array to match lines.length to draw path colors correctly!
// If segmentTimes is just `clusters.map(() => 0)`, the field might fail.
// Wait, the field uses segmentTimes to show timing data in the table, maybe to map line colors too?
// Let's check the return of calculatePipelineTimePrediction
console.log(s.substring(s.indexOf('return {'), s.indexOf('return {') + 500));
