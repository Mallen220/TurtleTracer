const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let lines = fs.readFileSync(file, 'utf-8').split('\n');

for (let i = 2370; i < 2405; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
}
