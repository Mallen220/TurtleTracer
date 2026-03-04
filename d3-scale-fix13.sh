#!/bin/bash
node -e "
const fs = require('fs');

// KeyboardShortcuts.svelte
let content = fs.readFileSync('src/lib/components/KeyboardShortcuts.svelte', 'utf8');

content = content.replace(/heading: tangential,/g, 'heading: \"tangential\",');

fs.writeFileSync('src/lib/components/KeyboardShortcuts.svelte', content);


// App.svelte
let contentApp = fs.readFileSync('src/App.svelte', 'utf8');
contentApp = contentApp.replace(/v => Number\(v\)/g, '((v: any) => Number(v)) as any');
fs.writeFileSync('src/App.svelte', contentApp);
"
