const fs = require('fs');
let code = fs.readFileSync('src/lib/components/FieldRenderer.svelte', 'utf-8');

const search = `      if (clickedElem) {
        isDown = true;
        currentElem = clickedElem;`;

const replace = `      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
      }

      if (clickedElem) {
        isDown = true;
        currentElem = clickedElem;`;

code = code.replace(search, replace);
fs.writeFileSync('src/lib/components/FieldRenderer.svelte', code);
