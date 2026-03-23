const fs = require('fs');
let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `            } else if (lines[line].controlPoints[point - 1]) {
              objectX = lines[line].controlPoints[point - 1].x;
              objectY = lines[line].controlPoints[point - 1].y;
            }
          }
        }
        multiDragOffsets.clear();
        const currentIds = $multiSelectedPointIds;

        currentIds.forEach(id => {
          let ox = 0, oy = 0;
          if (id.startsWith("obstacle-")) {`;

const replacement = `            } else if (lines[line].controlPoints[point - 1]) {
              objectX = lines[line].controlPoints[point - 1].x;
              objectY = lines[line].controlPoints[point - 1].y;
            }
          }
        }

        // Ensure multiDragOffsets handles multiple items correctly
        multiDragOffsets.clear();
        const currentIds = $multiSelectedPointIds;

        currentIds.forEach(id => {
          let ox = 0, oy = 0;
          if (id.startsWith("obstacle-")) {`;

// Wait, the "else" without a matching "if" is line 2399:
// 2397:         });
// 2398:
// 2399:       } else {

// Let's find what `}` the `});` closes.
// It closes `currentIds.forEach(id => {`
// But before `currentIds.forEach`, there is no `if` that would match `} else {` on 2399!
