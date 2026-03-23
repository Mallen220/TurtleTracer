const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `          multiDragOffsets.set(id, { x: ox - mouseX, y: oy - mouseY });
        });

      } else {
        // Start Panning
        isPanning = true;
        startPan = { x: evt.clientX, y: evt.clientY };
        two.renderer.domElement.style.cursor = "grabbing";
      }
    });`;

const replacement = `          multiDragOffsets.set(id, { x: ox - mouseX, y: oy - mouseY });
        });
      } else {
        // Start Panning
        isPanning = true;
        startPan = { x: evt.clientX, y: evt.clientY };
        two.renderer.domElement.style.cursor = "grabbing";
      }
    });`;

code = code.replace(target, replacement);

const target2 = `      if (clickedElem) {`;
// There are multiple `if (clickedElem) {`. Let's be precise.
let fullTarget = `      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
        multiSelectedLineIds.set([]);
      }

      if (clickedElem) {
        isDown = true;`;

let fullReplacement = `      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
        multiSelectedLineIds.set([]);
      }

      if (clickedElem) {
        isDown = true;`;

// The issue is simply `if (clickedElem) {` is at the top, and at the bottom `} else {`. This perfectly forms an if/else block.
// Wait! `currentIds.forEach(id => { ... });` is inside the `if (clickedElem) {` block!
// So:
// if (clickedElem) {
//    ...
//    currentIds.forEach(...)
// } else {
//    ... panning
// }

// The `});` ends `currentIds.forEach(id => {`. Then we have `}` which ends `if (clickedElem) {`. Then we have `else {`.
// Why does esbuild complain? "Expected ")" but found "else""
// That means something inside `if (clickedElem) {` or `currentIds.forEach(id => {` wasn't properly closed, or there's an extra `}`.
