const fs = require('fs');

let file = 'src/lib/components/KeyboardShortcuts.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `      selectedPointId.set(null);
      multiSelectedPointIds.set([]);
      selectedLineId.set(null);`;

const replacement = `      selectedPointId.set(null);
      multiSelectedPointIds.set([]);
      selectedLineId.set(null);
      multiSelectedLineIds.set([]);`;

code = code.replace(target, replacement);

const target2 = `    selectedPointId.set(null);
    multiSelectedPointIds.set([]);
    recordChange("Delete Selection");`;

const replacement2 = `    selectedPointId.set(null);
    multiSelectedPointIds.set([]);
    selectedLineId.set(null);
    multiSelectedLineIds.set([]);
    recordChange("Delete Selection");`;

code = code.replace(target2, replacement2);
fs.writeFileSync(file, code);
