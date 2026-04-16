const fs = require('fs');

function fixGeneratorUtils() {
  const p = 'src/lib/components/renderer/GeneratorUtils.ts';
  let s = fs.readFileSync(p, 'utf8');
  // It's still querying timePrediction.timeline which we exported as `events`.
  // Wait, timeline IS the events array! Let's check `calculatePipelineTimePrediction`.
  // return { timeline: timeline.states.length > 0 ? timeline.events : [] }
  // timeline IS the events! But maybe it's not being built perfectly in `TimelineGenerator.ts`?
  fs.writeFileSync(p, s);
}

fixGeneratorUtils();
