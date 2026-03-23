const fs = require('fs');

let file = 'src/lib/components/FieldRenderer.svelte';
let code = fs.readFileSync(file, 'utf-8');

const target = `            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        }
        } else if (currentElem.startsWith("targetpoint-")) {`;

const replacement = `            } else {
              multiSelectedLineIds.set([lId]);
            }
          }
        } else if (currentElem.startsWith("targetpoint-")) {`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
