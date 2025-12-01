import fs from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// Create a progress bar
function createProgressBar(total, current = 0) {
  const width = 30;
  const percentage = Math.min(100, (current / total) * 100);
  const filled = Math.floor((width * percentage) / 100);
  const empty = width - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `[${bar}] ${percentage.toFixed(1)}%`;
}

// Run command with streaming output and progress tracking
async function runCommandStream(command, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 ${label}...`);

    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    let output = "";
    let error = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;

      // Show progress for uploads
      if (text.includes("Uploading") || text.includes("uploading")) {
        const match = text.match(/(\d+)%/);
        if (match) {
          const percent = parseInt(match[1]);
          process.stdout.write(
            `\r📤 Uploading: ${createProgressBar(100, percent)}`,
          );
        }
      } else {
        console.log(`   ${text.trim()}`);
      }
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      error += text;
      console.log(`   ⚠ ${text.trim()}`);
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`\n✅ ${label} complete`);
        resolve({ stdout: output, stderr: error });
      } else {
        console.log(`\n❌ ${label} failed with code ${code}`);
        reject(new Error(`${label} failed: ${error}`));
      }
    });

    child.on("error", (err) => {
      console.log(`\n❌ ${label} error:`, err.message);
      reject(err);
    });
  });
}

// Simple command runner for non-interactive commands
async function runCommand(cmd, label) {
  console.log(`🚀 ${label}...`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname + "/.." });
    if (stderr && !stderr.includes("warning"))
      console.log(`   ${stderr.trim()}`);
    console.log(`✅ ${label} complete`);
    return stdout;
  } catch (error) {
    console.error(`\n❌ ${label} failed:`, error.message);
    throw error;
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(
    await fs.readFile(path.join(__dirname, "../package.json"), "utf8"),
  );
  return packageJson.version;
}

async function checkGitHubAuth() {
  try {
    await execAsync("gh auth status");
    console.log("✅ GitHub CLI authenticated");
    return true;
  } catch (error) {
    console.log("❌ GitHub CLI not authenticated or error:", error.message);
    console.log("\n💡 Please authenticate:");
    console.log("   1. Run: gh auth login");
    console.log('   2. Select "GitHub.com"');
    console.log('   3. Select "HTTPS" or "SSH"');
    console.log("   4. Follow the prompts");
    return false;
  }
}

async function createGitHubRelease(version, dmgPath) {
  const tag = `v${version}`;
  const title = `Pedro Pathing Visualizer ${version}`;

  // Try to get changelog if it exists
  let notes = `## 🚀 Quick Install

To update/install, simply run this one command in your terminal:

\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
\`\`\`

Enter your password when prompted (for clearing old versions and fixing permissions).

## 📦 Installation Options

### **Option 1: One-Line Install (Recommended)**
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
\`\`\`

### **Option 2: Manual Download**
1. Download the DMG above
2. Clear Mac decontamination quarantine:
\`\`\`bash
sudo xattr -rd com.apple.quarantine "/path/to/Pedro Pathing Visualizer.app"
\`\`\`
(Replace \`/path/to/\` with the actual path to the downloaded app)
3. Double-click to mount it
4. Drag to Applications folder
5. On first run: Right-click → Open, then click "Open" if prompted. This bypasses macOS security for apps from unidentified developers.

## 🔧 First Run Fix
If you get "App is damaged", run this one-time fix:
\`\`\`bash
sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"
\`\`\`

`;

  try {
    const changelog = await fs.readFile(
      path.join(__dirname, "../CHANGELOG.md"),
      "utf8",
    );
    const versionSection = changelog.match(
      new RegExp(`## ${version}[\\s\\S]*?(?=## |$)`),
    );
    if (versionSection) {
      notes += `\n## 📝 What's New in ${version}\n\n${versionSection[0].replace(`## ${version}`, "")}`;
    } else {
      notes += `\n## 📝 What's New\n\n- Bug fixes and improvements`;
    }
  } catch (error) {
    notes += `\n## 📝 What's New\n\n- Bug fixes and improvements`;
  }

  console.log(`\n📦 Creating GitHub release ${tag}...`);
  console.log(`📁 DMG: ${dmgPath}`);
  console.log(`📝 Notes length: ${notes.length} characters`);

  // Create a temporary file for the release notes
  const notesFile = path.join(__dirname, `../release-notes-${version}.md`);
  await fs.writeFile(notesFile, notes);

  try {
    await runCommandStream(
      "gh",
      [
        "release",
        "create",
        tag,
        dmgPath,
        "--title",
        title,
        "--notes-file",
        notesFile,
        "--draft",
        "--target",
        "main",
      ],
      "Creating GitHub draft release",
    );

    console.log("\n✨ Draft release created!");

    // Clean up notes file
    await fs.unlink(notesFile);
  } catch (error) {
    // Clean up notes file even on error
    try {
      await fs.unlink(notesFile);
    } catch {}

    throw error;
  }
}

async function main() {
  console.log("🚀 Pedro Pathing Visualizer Release Process");
  console.log("==========================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, resolve));

  try {
    // 1. Get current version
    const version = await getCurrentVersion();
    console.log(`📦 Current version: ${version}`);

    // 2. Confirm with user
    const proceed = await ask(`\nCreate release v${version}? (y/N): `);
    if (!proceed.toLowerCase().startsWith("y")) {
      console.log("Release cancelled.");
      rl.close();
      return;
    }

    // 3. Check GitHub auth
    console.log("\n🔐 Checking GitHub authentication...");
    const isAuthenticated = await checkGitHubAuth();
    if (!isAuthenticated) {
      console.log("\n❌ Cannot proceed without GitHub authentication.");
      rl.close();
      return;
    }

    // 4. Build the app
    console.log("\n🔨 Step 1: Building app...");
    console.log("========================");
    await runCommand("npm run build", "Building with Vite");

    // 5. Create DMG
    console.log("\n📦 Step 2: Creating DMG...");
    console.log("========================");
    await runCommand("npm run dist:unsigned", "Packaging for macOS");

    // 6. Find DMG
    console.log("\n🔍 Step 3: Finding DMG...");
    console.log("========================");
    const releaseDir = path.join(__dirname, "../release");
    const files = await fs.readdir(releaseDir);
    const dmgFile = files.find(
      (f) => f.includes(version) && f.endsWith(".dmg"),
    );

    if (!dmgFile) {
      throw new Error(`No DMG found for version ${version} in release/ folder`);
    }

    const dmgPath = path.join(releaseDir, dmgFile);
    const stats = await fs.stat(dmgPath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

    console.log(`✅ Found: ${dmgFile} (${sizeMB} MB)`);

    // 7. Create git tag
    console.log("\n🏷️  Step 4: Creating git tag...");
    console.log("============================");

    const tagExists = await (async () => {
      try {
        await execAsync(`git rev-parse v${version}`);
        return true;
      } catch {
        return false;
      }
    })();

    if (tagExists) {
      console.log(`⚠ Tag v${version} already exists. Skipping.`);
    } else {
      const createTag = await ask(`Create git tag v${version}? (y/N): `);
      if (createTag.toLowerCase().startsWith("y")) {
        await runCommand(
          `git tag -a v${version} -m "Release ${version}"`,
          "Creating git tag",
        );
        await runCommand(
          `git push origin v${version}`,
          "Pushing tag to GitHub",
        );
      } else {
        console.log("Skipping tag creation.");
      }
    }

    // 8. Create GitHub release
    console.log("\n🚀 Step 5: Creating GitHub release...");
    console.log("====================================");

    const createRelease = await ask(
      `Create GitHub draft release for v${version}? (y/N): `,
    );
    if (createRelease.toLowerCase().startsWith("y")) {
      console.log("\n📤 This may take a few minutes for the DMG upload...");
      await createGitHubRelease(version, dmgPath);

      console.log("\n✅ Release draft created!");
      console.log("\n📋 Next steps:");
      console.log("==============");
      console.log(
        "1. Review the draft: https://github.com/Mallen220/PedroPathingVisualizer/releases",
      );
      console.log("2. Edit release notes if needed");
      console.log('3. Click "Publish release"');
      console.log("4. Homebrew cask will auto-update via workflow");
    } else {
      console.log("Skipping GitHub release creation.");
      console.log(`\n📁 DMG is ready at: ${dmgPath}`);
      console.log("\nTo manually create release:");
      console.log(
        "1. Go to: https://github.com/Mallen220/PedroPathingVisualizer/releases/new",
      );
      console.log(`2. Tag: v${version}`);
      console.log(`3. Title: Pedro Pathing Visualizer ${version}`);
      console.log(`4. Attach: ${dmgFile}`);
    }

    console.log("\n🎉 Release process complete!");
  } catch (error) {
    console.error("\n❌ Release failed:", error.message);
    console.log("\n💡 Debug tips:");
    console.log("1. Check GitHub authentication: gh auth status");
    console.log("2. Try creating release manually");
    console.log("3. Check DMG exists in release/ folder");
  } finally {
    rl.close();
  }
}

main();
