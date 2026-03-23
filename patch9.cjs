const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `            }
          }
          if (lId) {
            if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
              multiSelectedLineIds.update(ids => ids.includes(lId) ? ids : [...ids, lId]);
            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        }`;

const replacement = `            }
          }
          if (lId) {
            if (evt.shiftKey || evt.ctrlKey || evt.metaKey) {
              multiSelectedLineIds.update(ids => ids.includes(lId!) ? ids : [...ids, lId!]);
            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        }`;

code = code.replace(target, replacement);

const target2 = `        } else if (currentElem.startsWith("targetpoint-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]) - 1;
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("event-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]);
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("wait-event-")) {
          const parts = currentElem.split("-");
          const waitId = parts[2];
          if (waitId) {
            selectedPointId.set(\`wait-\${waitId}\`);
            selectedLineId.set(null);
          }
        }`;

const replacement2 = `        } else if (currentElem.startsWith("targetpoint-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]) - 1;
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("event-")) {
          const parts = currentElem.split("-");
          const lineIdx = Number(parts[1]);
          if (!isNaN(lineIdx) && lines[lineIdx] && lines[lineIdx].id) {
            selectedLineId.set(lines[lineIdx].id as string);
            selectedPointId.set(currentElem);
          }
        } else if (currentElem.startsWith("wait-event-")) {
          const parts = currentElem.split("-");
          const waitId = parts[2];
          if (waitId) {
            selectedPointId.set(\`wait-\${waitId}\`);
            selectedLineId.set(null);
          }
        }`;

// Let's actually find the real syntax error
// "Expected ")" but found "else"" at 2398
