const fs = require('fs');

function fixSequenceGenerator() {
  const p = 'src/utils/engine/index.ts';
  let s = fs.readFileSync(p, 'utf8');
  // It needs to map `isChain: line.isChain` dynamically so that the first travel logic correctly processes chaining if it's fallback.
  s = s.replace(
     'const activeSequence = (sequence && sequence.length > 0) ? sequence : (lines.length > 0 ? [{ type: "travel", lineIndices: lines.map((_, i) => i) } as any] : []);',
     'const activeSequence = (sequence && sequence.length > 0) ? sequence : lines.map((l, i) => ({ type: "travel", lineIndices: [i], isChain: l.isChain } as any));'
  );
  fs.writeFileSync(p, s);
}

fixSequenceGenerator();
