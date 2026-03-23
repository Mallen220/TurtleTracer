const fs = require('fs');

// Patch App.svelte and other files to import `multiSelectedLineIds`
let files = [
  'src/lib/components/KeyboardShortcuts.svelte',
  'src/lib/components/FieldRenderer.svelte',
  'src/lib/components/WaypointTable.svelte'
];

files.forEach(file => {
  let code = fs.readFileSync(file, 'utf-8');
  if (!code.includes('multiSelectedLineIds')) {
    code = code.replace(/selectedLineId,/, 'selectedLineId,\n    multiSelectedLineIds,');
    fs.writeFileSync(file, code);
  }
});
