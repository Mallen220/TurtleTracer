const fs = require('fs');
let code = fs.readFileSync('src/stores.ts', 'utf-8');

// I'm adding `multiSelectedLineIds` to stores.ts
if (!code.includes('multiSelectedLineIds')) {
    const target = `export const selectedLineId = writable<string | null>(null);`;
    const replacement = `export const selectedLineId = writable<string | null>(null);
export const multiSelectedLineIds = writable<string[]>([]);`;
    code = code.replace(target, replacement);
    fs.writeFileSync('src/stores.ts', code);
}
