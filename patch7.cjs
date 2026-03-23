const fs = require('fs');
let code = fs.readFileSync('src/lib/components/KeyboardShortcuts.svelte', 'utf-8');

if (!code.includes('multiSelectedLineIds')) {
    code = code.replace(/selectedLineId,/, 'selectedLineId,\n    multiSelectedLineIds,');
    fs.writeFileSync('src/lib/components/KeyboardShortcuts.svelte', code);
}
