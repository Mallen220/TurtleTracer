const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
      }`;

const replacement = `      if (!clickedElem && !evt.shiftKey && !evt.ctrlKey && !evt.metaKey) {
        selectedPointId.set(null);
        selectedLineId.set(null);
        multiSelectedPointIds.set([]);
        multiSelectedLineIds.set([]);
      }`;

code = code.replace(target, replacement);

const target2 = `        // Single selection fallback updates for UI properties
        if (currentElem.startsWith("point-")) {
          const parts = currentElem.split("-");
          const lineNum = Number(parts[1]);
          const pointIdx = Number(parts[2]);
          if (!isNaN(lineNum) && lineNum > 0) {
            const lineIndex = lineNum - 1;
            const line = lines[lineIndex];
            if (line && line.id) {
              selectedLineId.set(line.id);
              selectedPointId.set(currentElem);
            }
          } else {
            if (currentElem === "point-0-0") {
              selectedLineId.set(null);
              selectedPointId.set(currentElem);
            } else {
              selectedLineId.set(null);
              selectedPointId.set(null);
            }
          }`;

const replacement2 = `        // Single selection fallback updates for UI properties
        if (currentElem.startsWith("point-")) {
          const parts = currentElem.split("-");
          const lineNum = Number(parts[1]);
          const pointIdx = Number(parts[2]);
          let lId = null;
          if (!isNaN(lineNum) && lineNum > 0) {
            const lineIndex = lineNum - 1;
            const line = lines[lineIndex];
            if (line && line.id) {
              lId = line.id;
              selectedLineId.set(line.id);
              selectedPointId.set(currentElem);
            }
          } else {
            if (currentElem === "point-0-0") {
              selectedLineId.set(null);
              selectedPointId.set(currentElem);
            } else {
              selectedLineId.set(null);
              selectedPointId.set(null);
            }
          }
          if (lId) {
            if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
              multiSelectedLineIds.update(ids => ids.includes(lId) ? ids : [...ids, lId]);
            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        }`;

code = code.replace(target2, replacement2);
fs.writeFileSync(file, code);
