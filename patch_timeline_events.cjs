const fs = require('fs');

function fixTimelineGen() {
  const p = 'src/utils/engine/TimelineGenerator.ts';
  let s = fs.readFileSync(p, 'utf8');
  // It is missing pushing the actual travel events for the full line!
  // `cluster.events` are just `eventMarkers` mapped from the lines.
  // The UI relies on `timeline` objects representing the ACTUAL travel sequences!
  // Svelte `PathGenerator` draws line overlays if `isHeatmapEnabled` based on `timePrediction.timeline.find(type === 'travel' && lineIndex === i)`.
  // `findActiveEvent` searches `timeline`.
  // Let's add a "travel" event for the entire duration of the cluster lines!
  s = s.replace(
      'globalTime += clusterDuration;',
      `// Create travel events for each line in the cluster
      let currentLineStart = startTime;
      let lastLineIdx = -1;
      for (const st of cluster.states) {
         if (st.lineIndex !== lastLineIdx) {
            if (lastLineIdx !== -1) {
               timeline.events.push({
                 type: "travel",
                 startTime: currentLineStart,
                 endTime: startTime + st.time,
                 duration: (startTime + st.time) - currentLineStart,
                 lineIndex: lastLineIdx
               } as any);
            }
            lastLineIdx = st.lineIndex;
            currentLineStart = startTime + st.time;
         }
      }
      if (lastLineIdx !== -1) {
         timeline.events.push({
           type: "travel",
           startTime: currentLineStart,
           endTime: startTime + clusterDuration,
           duration: (startTime + clusterDuration) - currentLineStart,
           lineIndex: lastLineIdx
         } as any);
      }
      globalTime += clusterDuration;`
  );

  // Oh, and we should sort timeline.events by startTime just in case
  s = s.replace('return timeline;', 'timeline.events.sort((a, b) => (a as any).startTime - (b as any).startTime);\n    return timeline;');
  fs.writeFileSync(p, s);
}

fixTimelineGen();
