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

// Let's print out more context to see where the real issue is
console.log(code.substring(code.indexOf('multiDragOffsets.set(id'), code.indexOf('multiDragOffsets.set(id') + 400));
