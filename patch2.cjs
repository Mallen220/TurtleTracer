const fs = require('fs');
let code = fs.readFileSync('src/lib/components/WaypointTable.svelte', 'utf-8');

const search = `  // Batch Actions Context Menu`;

const replace = `  $: {
    // Keep tab open when multi-selecting path items
    if ($multiSelectedPointIds.length > 0) {
      if (!["path", "table"].includes(activeControlTab)) {
        activeControlTab = "path";
      }
    }
  }

  // Batch Actions Context Menu`;

code = code.replace(search, replace);
fs.writeFileSync('src/lib/components/WaypointTable.svelte', code);
