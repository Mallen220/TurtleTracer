const fs = require('fs');
let code = fs.readFileSync('src/lib/components/WaypointTable.svelte', 'utf-8');

const target = `  export let toggleSequenceItemLock: (idx: number) => void;
  export let onInteraction: () => void = () => {};`;

const replacement = `  export let toggleSequenceItemLock: (idx: number) => void;
  export let onInteraction: () => void = () => {};

  $: {
    if ($multiSelectedPointIds.length > 0) {
      if (!["path", "table", "field"].includes(activeControlTab)) {
        activeControlTab = "path";
      }
    }
  }`;

code = code.replace(target, replacement);
fs.writeFileSync('src/lib/components/WaypointTable.svelte', code);
