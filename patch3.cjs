const fs = require('fs');
let code = fs.readFileSync('src/lib/components/WaypointTable.svelte', 'utf-8');

const search = `  // Batch Actions Context Menu`;

const replace = `  $: {
    if ($multiSelectedPointIds.length > 0) {
      if (!["path", "table", "field"].includes(activeControlTab)) {
        activeControlTab = "path";
      }
    }
  }

  // Batch Actions Context Menu`;

// revert previous patch and apply this one
let orig = fs.readFileSync('src/lib/components/WaypointTable.svelte', 'utf-8');
const oldPatch = `  $: {
    // Keep tab open when multi-selecting path items
    if ($multiSelectedPointIds.length > 0) {
      if (!["path", "table"].includes(activeControlTab)) {
        activeControlTab = "path";
      }
    }
  }

  // Batch Actions Context Menu`;

code = orig.replace(oldPatch, replace);
fs.writeFileSync('src/lib/components/WaypointTable.svelte', code);
