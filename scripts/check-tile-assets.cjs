/*
CommonJS validation for tile assets under `build/win/`.
Run with: npm run check:tiles
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

async function main() {
  const outDir = path.resolve(__dirname, "..", "build", "win");
  const buildRoot = path.resolve(__dirname, "..", "build");
  const required = [
    { name: "Square44x44Logo.png", width: 44, height: 44 },
    { name: "Square44x44Logo.scale-200.png", width: 88, height: 88 },
    { name: "StoreLogo.png", width: 50, height: 50 },
    { name: "Square71x71Logo.png", width: 71, height: 71 },
    { name: "Square150x150Logo.png", width: 150, height: 150 },
    { name: "Wide310x150Logo.png", width: 310, height: 150 },
    { name: "Square310x310Logo.png", width: 310, height: 310 },
    { name: "icon.ico", width: 256, height: 256 },
  ];

  let failed = false;
  for (const r of required) {
    const pRoot = path.join(buildRoot, r.name);
    const pWin = path.join(outDir, r.name);
    const p = fs.existsSync(pRoot) ? pRoot : pWin;
    if (!fs.existsSync(p)) {
      console.error("MISSING (build/ or build/win):", r.name);
      failed = true;
      continue;
    }

    // For ico, dimensions can be multiple, but we check if we can read it.
    // If it's ico, sharp might return the largest one.
    if (r.name.endsWith(".ico")) {
      // Just check existence for now, or use sharp metadata if it supports ico fully
      // sharp supports ico via libvips? often limited.
      // The original script skipped ico check.
      // We'll skip size check for ico to be safe unless we are sure.
      continue;
    }

    try {
      if (useSharp) {
        const sharp = require("sharp");
        const meta = await sharp(p).metadata();
        if (meta.width !== r.width || meta.height !== r.height) {
          console.error(
            "INVALID SIZE:",
            r.name,
            `(${meta.width}x${meta.height} != ${r.width}x${r.height})`,
          );
          failed = true;
        }
      } else {
        const { loadImage } = require("canvas");
        const img = await loadImage(p);
        if (img.width !== r.width || img.height !== r.height) {
          console.error(
            "INVALID SIZE:",
            r.name,
            `(${img.width}x${img.height} != ${r.width}x${r.height})`,
          );
          failed = true;
        }
      }
    } catch (e) {
      console.error("ERROR reading", r.name, e.message);
      failed = true;
    }
  }

  if (failed) {
    console.error(
      "\nTile asset check failed — ensure `npm run generate:icons` is run before building.",
    );
    process.exit(1);
  }
  console.log("Tile asset check passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
