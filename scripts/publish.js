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
    if (stderr && !stderr.includes("warning")) console.log(stderr);
    console.log(`✅ ${label} complete`);
    return stdout;
  } catch (error) {
    console.error(`❌ ${label} failed:`, error.message);
    throw error;
  }
}

async function checkGitHubCLI() {
  try {
    await execAsync("which gh");
    return true;
  } catch {
    return false;
  }
}

async function installGitHubCLI() {
  console.log("📦 GitHub CLI not found. Installing...");
  try {
    await execAsync("brew install gh");
    console.log("✅ GitHub CLI installed");

    // Check if user is logged in
    try {
      await execAsync("gh auth status");
      console.log("✅ GitHub CLI authenticated");
      return true;
    } catch {
      console.log("⚠️  GitHub CLI not authenticated");
      console.log("Please run: gh auth login");
      return false;
    }
  } catch (error) {
    console.error("❌ Failed to install GitHub CLI:", error.message);
    console.log("You can install it manually: brew install gh");
    return false;
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(__dirname, "../package.json"), "utf8"),
  );
  return packageJson.version;
}

async function createReleaseWithGH(version, dmgPath) {
  const tag = `v${version}`;
  const title = `Pedro Pathing Visualizer ${version}`;
  const notes = `## What's New\n\n- Update description here\n\n## Installation\n\n### Via Homebrew:\n\`\`\`bash\nbrew tap Mallen220/PedroPathingVisualizer\nbrew install --cask pedro-pathing-visualizer\n\`\`\`\n\n### Direct Download:\nDownload the DMG above and drag to Applications.`;

  await runCommand(
    `gh release create ${tag} ${dmgPath} --title "${title}" --notes "${notes}" --draft`,
    "Creating GitHub draft release",
  );
}

async function createReleaseManually(version, dmgPath) {
  const tag = `v${version}`;
  console.log("\n📋 Manual Release Instructions:");
  console.log("=============================");
  console.log(
    `1. Go to: https://github.com/Mallen220/PedroPathingVisualizer/releases/new`,
  );
  console.log(`2. Tag: ${tag}`);
  console.log(`3. Title: Pedro Pathing Visualizer ${version}`);
  console.log(`4. Description: Copy from CHANGELOG.md or write your own`);
  console.log(`5. Attach DMG: ${dmgPath}`);
  console.log(`6. Check "Set as latest release"`);
  console.log(`7. Click "Publish release"`);

  // Try to open the browser
  try {
    if (process.platform === "darwin") {
      await execAsync(
        `open "https://github.com/Mallen220/PedroPathingVisualizer/releases/new"`,
      );
    }
  } catch (error) {
    // Ignore if we can't open browser
  }
}

async function createAndPushTag(version) {
  const tag = `v${version}`;

  console.log(`📦 Creating release for version ${version}`);

  // Check if tag already exists
  try {
    await execAsync(`git rev-parse ${tag}`, { cwd: __dirname + "/.." });
    console.log(`⚠ Tag ${tag} already exists. Skipping tag creation.`);
    return false; // Tag already exists
  } catch {
    // Create tag
    await runCommand(
      `git tag -a ${tag} -m "Release ${version}"`,
      "Creating git tag",
    );
    await runCommand(`git push origin ${tag}`, "Pushing tag to GitHub");
    return true; // Tag was created
  }
}

async function main() {
  console.log("🚀 Starting release process...\n");

  try {
    // 1. Build the app
    await runCommand("npm run build", "Building app");

    // 2. Create DMG
    await runCommand("npm run dist:unsigned", "Creating DMG");

    // 3. Get version and DMG path
    const version = await getCurrentVersion();
    const dmgPath = `release/Pedro Pathing Visualizer-${version}-arm64.dmg`;

    // Check if DMG exists
    try {
      await fs.access(path.join(__dirname, "..", dmgPath));
    } catch {
      console.log(
        `⚠ DMG not found at ${dmgPath}. Looking for alternatives...`,
      );
      // Try to find DMG with arm64 suffix
      const altDmgPath = `release/Pedro Pathing Visualizer-${version}.dmg`;
      try {
        await fs.access(path.join(__dirname, "..", altDmgPath));
        dmgPath = altDmgPath;
      } catch {
        throw new Error(`No DMG found for version ${version}`);
      }
    }

    console.log(`📦 DMG ready: ${dmgPath}`);

    // 4. Create and push tag
    const tagCreated = await createAndPushTag(version);

    if (!tagCreated) {
      console.log("\n⚠ Tag already exists. Skipping release creation.");
      console.log("If you want to create a new release:");
      console.log("1. Update version in package.json");
      console.log("2. Run: npm run dist:publish");
      return;
    }

    // 5. Create release (try with gh, fallback to manual)
    const hasGH = await checkGitHubCLI();

    if (hasGH) {
      try {
        await createReleaseWithGH(version, dmgPath);
        console.log("\n✨ Release draft created!");
        console.log(
          "👉 Visit: https://github.com/Mallen220/PedroPathingVisualizer/releases",
        );
      } catch (ghError) {
        console.log(
          "⚠ Failed to create release with gh, falling back to manual...",
        );
        await createReleaseManually(version, dmgPath);
      }
    } else {
      console.log("ℹ GitHub CLI not found.");
      const install = process.argv.includes("--install-gh");

      if (install) {
        const installed = await installGitHubCLI();
        if (installed) {
          await createReleaseWithGH(version, dmgPath);
        } else {
          await createReleaseManually(version, dmgPath);
        }
      } else {
        console.log(
          "💡 Run with --install-gh to install GitHub CLI and automate release creation",
        );
        await createReleaseManually(version, dmgPath);
      }
    }

    console.log("\n🎉 Release process complete!");
    console.log("\nNext steps:");
    console.log("1. If using manual method, create the release on GitHub");
    console.log("2. The Homebrew cask will auto-update via workflow");
    console.log("3. Update the cask SHA256 if needed");
  } catch (error) {
    console.error("\n❌ Release failed:", error.message);
    console.log("\n💡 Try running:");
    console.log("  npm run dist:unsigned  # Just build the DMG");
    console.log(
      "  npm run dist:publish -- --install-gh  # Install GitHub CLI and retry",
    );
    process.exit(1);
  }
}

main();
