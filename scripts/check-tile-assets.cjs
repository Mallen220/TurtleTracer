/*
CommonJS validation for tile assets under `build/win/`.
Run with: npm run check:tiles
*/

const fs = require('fs');
const path = require('path');

function hasPackage(name) { try { require.resolve(name); return true; } catch (e) { return false; } }
const useSharp = hasPackage('sharp');

async function main() {
  const outDir = path.resolve(__dirname, '..', 'build', 'win');
  const required = [
    { name: 'Square44x44Logo.png', width: 44 },
    { name: 'Square44x44Logo.scale-200.png', width: 88 },
    { name: 'StoreLogo.png', width: 50 },
    { name: 'Square150x150Logo.png', width: 150 },
    { name: 'Wide310x150Logo.png', width: 310 },
    { name: 'Square310x310Logo.png', width: 310 },
    { name: 'icon.ico', width: 256 }
  ];

  let failed = false;
  for (const r of required) {
    const p = path.join(outDir, r.name);
    if (!fs.existsSync(p)) {
      console.error('MISSING:', r.name);
      failed = true;
      continue;
    }
    if (r.name.endsWith('.ico')) continue;

    try {
      if (useSharp) {
        const sharp = require('sharp');
        const meta = await sharp(p).metadata();
        if (meta.width < r.width) {
          console.error('INVALID SIZE:', r.name, `(${meta.width} < ${r.width})`);
          failed = true;
        }
      } else {
        const { loadImage } = require('canvas');
        const img = await loadImage(p);
        if (img.width < r.width) {
          console.error('INVALID SIZE:', r.name, `(${img.width} < ${r.width})`);
          failed = true;
        }
      }
    } catch (e) {
      console.error('ERROR reading', r.name, e.message);
      failed = true;
    }
  }

  if (failed) {
    console.error('\nTile asset check failed — ensure `npm run generate:icons` is run before building.');
    process.exit(1);
  }
  console.log('Tile asset check passed.');
}

main().catch(err => { console.error(err); process.exit(1); });