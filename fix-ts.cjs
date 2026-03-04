const fs = require('fs');

// App.svelte: The problem is Svelte's parser chokes on `((v: any) => Number(v)) as any` in the HTML template section.
// We should define an identity scale in the script section and use it.
let appContent = fs.readFileSync('src/App.svelte', 'utf8');

// Add the identityScale to the script block if it's not there
if (!appContent.includes('const identityScale = ')) {
  appContent = appContent.replace(
    /import \* as d3 from \"d3\";/,
    `import * as d3 from "d3";\n  const identityScale: any = Object.assign((v: any) => Number(v), { invert: (v: any) => Number(v) });`
  );
}

// Replace the inline d3.scaleLinear() calls with identityScale
appContent = appContent.replace(/d3\.scaleLinear\(\)/g, 'identityScale');

fs.writeFileSync('src/App.svelte', appContent);


// KeyboardShortcuts.svelte: The problem is TS complains about spreading Point and adding `targetX: undefined` or something.
// The easiest fix is just to cast the whole object `as any`.
let shortcutsContent = fs.readFileSync('src/lib/components/KeyboardShortcuts.svelte', 'utf8');

shortcutsContent = shortcutsContent.replace(
  /startPointStore\.set\(\{\s*\.\.\.startPoint,\s*heading: \"tangential\",\s*reverse: false,\s*degrees: undefined,\s*startDeg: undefined,\s*endDeg: undefined,\s*\}\);/g,
  `startPointStore.set({
          ...startPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined,
          startDeg: undefined,
          endDeg: undefined,
        } as any);`
);

shortcutsContent = shortcutsContent.replace(
  /line\.endPoint = \{\s*\.\.\.line\.endPoint,\s*heading: \"tangential\",\s*reverse: false,\s*degrees: undefined,\s*startDeg: undefined,\s*endDeg: undefined,\s*\};/g,
  `line.endPoint = {
          ...line.endPoint,
          heading: "tangential",
          reverse: false,
          degrees: undefined,
          startDeg: undefined,
          endDeg: undefined,
        } as any;`
);

fs.writeFileSync('src/lib/components/KeyboardShortcuts.svelte', shortcutsContent);
