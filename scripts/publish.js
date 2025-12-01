import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

async function runCommand(cmd, label) {
  console.log(`🚀 ${label}...`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname + "/.." });
    if (stderr) console.log(stderr);
    console.log(`✅ ${label} complete`);
    return stdout;
  } catch (error) {
    console.error(`❌ ${label} failed:`, error.message);
    throw error;
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(__dirname, "../package.json"), "utf8"),
  );
  return packageJson.version;
}

async function createGitHubRelease() {
  const version = await getCurrentVersion();
  const tag = `v${version}`;

  console.log(`📦 Creating release for version ${version}`);

  // Check if tag already exists
  try {
    await execAsync(`git rev-parse ${tag}`, { cwd: __dirname + "/.." });
    console.log(`⚠ Tag ${tag} already exists. Skipping tag creation.`);
  } catch {
    // Create tag
    await runCommand(
      `git tag -a ${tag} -m "Release ${version}"`,
      "Creating git tag",
    );
    await runCommand(`git push origin ${tag}`, "Pushing tag to GitHub");
  }

  // Create draft release
  const dmgPath = `release/Pedro Pathing Visualizer-${version}.dmg`;

  await runCommand(
    `gh release create ${tag} ${dmgPath} --title "Pedro Pathing Visualizer ${version}" --notes "Release ${version}" --draft`,
    "Creating GitHub draft release",
  );

  console.log("\n✨ Release draft created!");
  console.log(
    "👉 Visit: https://github.com/Mallen220/PedroPathingVisualizer/releases",
  );
}

async function main() {
  console.log("🚀 Starting release process...\n");

  try {
    // 1. Build the app
    await runCommand("npm run build", "Building app");

    // 2. Create DMG
    await runCommand("npm run dist:unsigned", "Creating DMG");

    // 3. Create GitHub release draft
    await createGitHubRelease();

    console.log("\n🎉 Release process complete!");
    console.log("\nNext steps:");
    console.log("1. Review the draft release on GitHub");
    console.log("2. Update release notes if needed");
    console.log('3. Click "Publish release"');
    console.log("4. Homebrew cask will auto-update via workflow");
  } catch (error) {
    console.error("\n❌ Release failed:", error.message);
    process.exit(1);
  }
}

main();
