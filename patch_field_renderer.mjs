import fs from 'fs';

let content = fs.readFileSync("src/lib/components/FieldRenderer.svelte", "utf8");

content = content.replace(
  /linesStore\.update\(\(l\) => \{\s*const line = l\[lineIndex\];\s*if \(\!line\) return l;\s*const ep = line\.endPoint;\s*const base = \{\s*x: ep\.x,\s*y: ep\.y,\s*locked: ep\.locked,\s*isMacroElement: ep\.isMacroElement,\s*macroId: ep\.macroId,\s*originalId: ep\.originalId,\s*\};\s*line\.endPoint = \{\s*\.\.\.base,\s*heading: "tangential",\s*reverse: \(ep as any\)\.reverse \?\? false,\s*\};\s*return l;\s*\}\);/,
  `linesStore.update((l) => {
                  const newLines = [...l];
                  const line = { ...newLines[lineIndex] };
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "tangential",
                    reverse: (ep as any).reverse ?? false,
                  };
                  newLines[lineIndex] = line;
                  return newLines;
                });`
);

content = content.replace(
  /linesStore\.update\(\(l\) => \{\s*const line = l\[lineIndex\];\s*if \(\!line\) return l;\s*const ep = line\.endPoint;\s*const base = \{\s*x: ep\.x,\s*y: ep\.y,\s*locked: ep\.locked,\s*isMacroElement: ep\.isMacroElement,\s*macroId: ep\.macroId,\s*originalId: ep\.originalId,\s*\};\s*line\.endPoint = \{\s*\.\.\.base,\s*heading: "constant",\s*degrees: \(ep as any\)\.degrees \?\? 0,\s*\};\s*return l;\s*\}\);/,
  `linesStore.update((l) => {
                  const newLines = [...l];
                  const line = { ...newLines[lineIndex] };
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "constant",
                    degrees: (ep as any).degrees ?? 0,
                  };
                  newLines[lineIndex] = line;
                  return newLines;
                });`
);

content = content.replace(
  /linesStore\.update\(\(l\) => \{\s*const line = l\[lineIndex\];\s*if \(\!line\) return l;\s*const ep = line\.endPoint;\s*const base = \{\s*x: ep\.x,\s*y: ep\.y,\s*locked: ep\.locked,\s*isMacroElement: ep\.isMacroElement,\s*macroId: ep\.macroId,\s*originalId: ep\.originalId,\s*\};\s*line\.endPoint = \{\s*\.\.\.base,\s*heading: "linear",\s*startDeg: \(ep as any\)\.startDeg \?\? 0,\s*endDeg: \(ep as any\)\.endDeg \?\? 0,\s*\};\s*return l;\s*\}\);/,
  `linesStore.update((l) => {
                  const newLines = [...l];
                  const line = { ...newLines[lineIndex] };
                  if (!line) return l;
                  const ep = line.endPoint;
                  const base = {
                    x: ep.x,
                    y: ep.y,
                    locked: ep.locked,
                    isMacroElement: ep.isMacroElement,
                    macroId: ep.macroId,
                    originalId: ep.originalId,
                  };
                  line.endPoint = {
                    ...base,
                    heading: "linear",
                    startDeg: (ep as any).startDeg ?? 0,
                    endDeg: (ep as any).endDeg ?? 0,
                  };
                  newLines[lineIndex] = line;
                  return newLines;
                });`
);

fs.writeFileSync("src/lib/components/FieldRenderer.svelte", content);
