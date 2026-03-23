const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const errorArea = code.substring(code.indexOf('if (clickedElem) {'), code.indexOf('// Double Click to Add Line'));

fs.writeFileSync('error_area.txt', errorArea);
