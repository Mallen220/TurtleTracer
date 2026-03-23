const fs = require('fs');
let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const regex = /multiDragOffsets\.set\(id, { x: ox - mouseX, y: oy - mouseY }\);\n\s*\}\);\n\n\s*\} else \{/g;
if (regex.test(code)) {
    console.log('Match found!');
} else {
    console.log('Match NOT found. Let me look at line 2398 specifically');
}
