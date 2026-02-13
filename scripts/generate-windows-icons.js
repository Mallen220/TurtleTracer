// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/*
Generates Windows tile assets from `public/icon.png`.
Uses `sharp` when available, otherwise falls back to the already-installed `canvas` package.
Outputs PNGs into `build/win/` with common UWP tile names and 100% + 200% variants.
Run with: npm run generate:icons
*/

const fs = require("fs");
const path = require("path");

function hasPackage(name) {
  try {
    require.resolve(name);
    return true;
  } catch (e) {
    return false;
  }
}

const useSharp = hasPackage("sharp");

async function resizeWithCanvas(srcPath, width, height, outPath) {
  const { createCanvas, loadImage } = require("canvas");
  const img = await loadImage(srcPath);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  // cover fit: draw centered crop
  const scale = Math.max(width / img.width, height / img.height);
  const sw = Math.ceil(width / scale);
  const sh = Math.ceil(height / scale);
  const sx = Math.floor((img.width - sw) / 2);
  const sy = Math.floor((img.height - sh) / 2);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const out = fs.createWriteStream(outPath);
  const stream = canvas.createPNGStream();
  await new Promise((res, rej) => {
    stream.pipe(out);
    out.on("finish", res);
    out.on("error", rej);
  });
}

async function main() {
  const src = path.resolve(__dirname, "..", "public", "icon.png");
  const outDir = path.resolve(__dirname, "..", "build", "win");
  if (!fs.existsSync(src)) {
    console.error("Source icon not found at", src);
    process.exit(2);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // UWP tile names and their base sizes (scale 100%)
  const tiles = [
    { name: "Square44x44Logo", size: 44 },
    { name: "StoreLogo", size: 50 },
    { name: "Square150x150Logo", size: 150 },
    { name: "Wide310x150Logo", size: 310 },
    { name: "Square310x310Logo", size: 310 },
  ];

  for (const tile of tiles) {
    const size = tile.size;
    const out100 = path.join(outDir, `${tile.name}.png`);
    const out200 = path.join(outDir, `${tile.name}.scale-200.png`);
    if (useSharp) {
      const sharp = require("sharp");
      await sharp(src)
        .resize(size, size, { fit: "cover" })
        .png()
        .toFile(out100);
      await sharp(src)
        .resize(size * 2, size * 2, { fit: "cover" })
        .png()
        .toFile(out200);
    } else {
      await resizeWithCanvas(src, size, size, out100);
      await resizeWithCanvas(src, size * 2, size * 2, out200);
    }
    console.log("Wrote", out100, "and", out200);

    // copy to top-level build/ so electron-builder Appx uses these files
    const buildRoot = path.resolve(__dirname, '..', 'build');
    try {
      fs.copyFileSync(out100, path.join(buildRoot, path.basename(out100)));
      fs.copyFileSync(out200, path.join(buildRoot, path.basename(out200)));
    } catch (err) {
      console.warn('Could not copy tile to build root:', err && err.message ? err.message : err);
    }
  }

  // Write a basic icon.ico (prefer png-to-ico if available)
  const icoPath = path.join(outDir, "icon.ico");
  if (useSharp) {
    const sharp = require("sharp");
    const buf = await sharp(src).resize(256, 256).png().toBuffer();
    if (hasPackage("png-to-ico")) {
      const pngToIco = require("png-to-ico");
      const icoBuf = await pngToIco(buf);
      fs.writeFileSync(icoPath, icoBuf);
    } else {
      fs.writeFileSync(icoPath, buf);
    }
  } else {
    // canvas -> PNG buffer; fallback to a single-size .ico-like file
    const { createCanvas, loadImage } = require("canvas");
    const img = await loadImage(src);
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 256, 256);
    const buf = canvas.toBuffer("image/png");
    fs.writeFileSync(icoPath, buf);
  }
  try {
    const topIco = path.join(path.resolve(__dirname, '..', 'build'), path.basename(icoPath));
    fs.copyFileSync(icoPath, topIco);
    console.log('Also wrote', topIco);
  } catch (err) {
    console.warn('Could not copy icon.ico to build root:', err && err.message ? err.message : err);
  }
  console.log("Wrote", icoPath);
  console.log("Windows tile asset generation complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
