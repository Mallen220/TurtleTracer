/*
CommonJS entry: generates Windows tile assets from `public/icon.png`.
Falls back to `canvas` if `sharp` is not installed.
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

async function resizeWithCanvas(
  srcPath,
  width,
  height,
  outPath,
  fit = "cover",
) {
  const { createCanvas, loadImage } = require("canvas");
  const img = await loadImage(srcPath);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (fit === "contain") {
    const scale = Math.min(width / img.width, height / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (width - dw) / 2;
    const dy = (height - dh) / 2;
    ctx.drawImage(img, 0, 0, img.width, img.height, dx, dy, dw, dh);
  } else {
    // cover
    const scale = Math.max(width / img.width, height / img.height);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  }

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
  // electron-builder defaults to `build/appx` for AppX assets if not specified
  const outDir = path.resolve(__dirname, "..", "build", "appx");
  // we also need `build/win` for NSIS icon.ico
  const winDir = path.resolve(__dirname, "..", "build", "win");

  if (!fs.existsSync(src)) {
    console.error("Source icon not found at", src);
    process.exit(2);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  if (!fs.existsSync(winDir)) fs.mkdirSync(winDir, { recursive: true });

  const tiles = [
    { name: "Square44x44Logo", width: 44, height: 44, fit: "cover" },
    { name: "StoreLogo", width: 50, height: 50, fit: "cover" },
    { name: "Square71x71Logo", width: 71, height: 71, fit: "cover" },
    { name: "Square150x150Logo", width: 150, height: 150, fit: "cover" },
    { name: "Wide310x150Logo", width: 310, height: 150, fit: "contain" },
    { name: "Square310x310Logo", width: 310, height: 310, fit: "cover" },
  ];

  for (const tile of tiles) {
    const out100 = path.join(outDir, `${tile.name}.png`);
    const out200 = path.join(outDir, `${tile.name}.scale-200.png`);

    // For scale-200, we double dimensions
    const w1 = tile.width;
    const h1 = tile.height;
    const w2 = tile.width * 2;
    const h2 = tile.height * 2;

    if (useSharp) {
      const sharp = require("sharp");
      await sharp(src)
        .resize(w1, h1, {
          fit: tile.fit,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(out100);

      await sharp(src)
        .resize(w2, h2, {
          fit: tile.fit,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toFile(out200);
    } else {
      await resizeWithCanvas(src, w1, h1, out100, tile.fit);
      await resizeWithCanvas(src, w2, h2, out200, tile.fit);
    }

    console.log("Wrote", out100, "and", out200);

    // ensure top-level `build/` also contains the same tile files so electron-builder
    // includes them in the generated Appx manifest (Windows Start/Store tiles)
    const buildRoot = path.resolve(__dirname, "..", "build");
    try {
      fs.copyFileSync(out100, path.join(buildRoot, path.basename(out100)));
      fs.copyFileSync(out200, path.join(buildRoot, path.basename(out200)));
    } catch (err) {
      console.warn(
        "Could not copy tile to build root:",
        err && err.message ? err.message : err,
      );
    }
  }

  const icoPath = path.join(winDir, "icon.ico");
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
    const { createCanvas, loadImage } = require("canvas");
    const img = await loadImage(src);
    const canvas = createCanvas(256, 256);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, 256, 256);
    const buf = canvas.toBuffer("image/png");
    fs.writeFileSync(icoPath, buf);
  }

  // also copy icon.ico to top-level build/ for installer packages
  try {
    const topIco = path.join(
      path.resolve(__dirname, "..", "build"),
      path.basename(icoPath),
    );
    fs.copyFileSync(icoPath, topIco);
    console.log("Also wrote", topIco);
  } catch (err) {
    console.warn(
      "Could not copy icon.ico to build root:",
      err && err.message ? err.message : err,
    );
  }

  console.log("Wrote", icoPath);
  console.log("Windows tile asset generation complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
