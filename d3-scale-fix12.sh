#!/bin/bash
node -e "
const fs = require('fs');

// KeyboardShortcuts.svelte
let content = fs.readFileSync('src/lib/components/KeyboardShortcuts.svelte', 'utf8');

content = content.replace(/startPointStore\.set\(\{[\s\n]*\.\.\.startPoint,[\s\n]*heading: \"tangential\",[\s\n]*reverse: false,[\s\n]*degrees: undefined,[\s\n]*startDeg: undefined,[\s\n]*endDeg: undefined,[\s\n]*\}\);/g,
\`startPointStore.set({
          ...startPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined as any,
          startDeg: undefined as any,
          endDeg: undefined as any,
        });\`);

content = content.replace(/line\.endPoint = \{[\s\n]*\.\.\.line\.endPoint,[\s\n]*heading: \"tangential\",[\s\n]*reverse: false,[\s\n]*degrees: undefined,[\s\n]*startDeg: undefined,[\s\n]*endDeg: undefined,[\s\n]*\};/g,
\`line.endPoint = {
          ...line.endPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined as any,
          startDeg: undefined as any,
          endDeg: undefined as any,
        };\`);

fs.writeFileSync('src/lib/components/KeyboardShortcuts.svelte', content);


// App.svelte
let contentApp = fs.readFileSync('src/App.svelte', 'utf8');
contentApp = contentApp.replace(/\(\(v: any\) => Number\(v\)\) as any/g, 'v => Number(v)');
fs.writeFileSync('src/App.svelte', contentApp);
"
