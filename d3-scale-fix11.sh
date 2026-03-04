#!/bin/bash
node -e "
const fs = require('fs');

// App.svelte
let content = fs.readFileSync('src/App.svelte', 'utf8');

content = content.replace(/\$: x = d3[\s\S]*?\]\);/m,
\`$: xOffset = 0;
  $: xScaleMult = (fieldDrawSize || FIELD_SIZE) / FIELD_SIZE;
  $: x = Object.assign(
    (val: number) => xOffset + val * xScaleMult,
    { invert: (val: number) => (val - xOffset) / xScaleMult }
  ) as any;\`);

content = content.replace(/\$: y = d3[\s\S]*?\]\);/m,
\`$: yOffset = fieldDrawSize || FIELD_SIZE;
  $: yScaleMult = (fieldDrawSize || FIELD_SIZE) / FIELD_SIZE;
  $: y = Object.assign(
    (val: number) => yOffset - val * yScaleMult,
    { invert: (val: number) => (yOffset - val) / yScaleMult }
  ) as any;\`);

content = content.replace(/d3\.scaleLinear\(\)/g, '((v: any) => Number(v)) as any');
fs.writeFileSync('src/App.svelte', content);


// FieldRenderer.svelte
let contentFR = fs.readFileSync('src/lib/components/FieldRenderer.svelte', 'utf8');

contentFR = contentFR.replace(/\$: x = d3[\s\S]*?\]\);/m,
\`$: xOffset = width / 2 - (baseSize * scaleFactor) / 2 + pan.x;
  $: xScaleMult = (baseSize * scaleFactor) / FIELD_SIZE;
  $: x = Object.assign(
    (val: number) => xOffset + val * xScaleMult,
    { invert: (val: number) => (val - xOffset) / xScaleMult }
  ) as any;\`);

contentFR = contentFR.replace(/\$: y = d3[\s\S]*?\]\);/m,
\`$: yOffset = height / 2 + (baseSize * scaleFactor) / 2 + pan.y;
  $: yScaleMult = (baseSize * scaleFactor) / FIELD_SIZE;
  $: y = Object.assign(
    (val: number) => yOffset - val * yScaleMult,
    { invert: (val: number) => (yOffset - val) / yScaleMult }
  ) as any;\`);

fs.writeFileSync('src/lib/components/FieldRenderer.svelte', contentFR);
"
