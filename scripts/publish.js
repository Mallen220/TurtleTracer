// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

async function runCommand(cmd, label) {
  console.log(`${label}...`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { cwd: __dirname + "/.." });
    if (stderr && !stderr.toLowerCase().includes("warning")) {
      console.log(stderr.trim());
    }
    console.log(`${label} complete`);
    return stdout;
  } catch (error) {
    console.error(`${label} failed:`, error.message);
    throw error;
  }
}

async function getCurrentVersion() {
  const packageJson = JSON.parse(
    // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
    await fs.readFile(path.join(__dirname, "../package.json"), "utf8"),
  );
  return packageJson.version;
}

async function checkGitHubAuth() {
  try {
    await execAsync("gh auth status");
    console.log("GitHub CLI authenticated");
    return true;
  } catch {
    console.log("GitHub CLI not authenticated");
    console.log("Run `gh auth login` before continuing");
    return false;
  }
}

async function createGitHubRelease(version) {
  const tag = `v${version}`;
  const title = `Turtle Tracer ${version}`;

  // NOTE CONTENT IS UNCHANGED
  let notes = `## 🚀 Quick Update

Refer to the README installation section for instructions on installing or updating Turtle Tracer. Below is a condensed version of the instructions for quick reference. 

This repo is regularly updated with new features and bug fixes but tested primarily on macOS. Should an issue arise, please report it via the GitHub Issues page and revert to the previous stable version if needed.

#### **macOS / Linux**
Run the following command in terminal and provide your password when prompted:
\`\`\`bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
\`\`\`

#### **Windows**
Download and install via the  \`.exe\` installer below.

## 📝 Release Notes
`;

  try {
    // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
    const changelog = await fs.readFile(
      path.join(__dirname, "../CHANGELOG.md"),
      "utf8",
    );
    const versionSection = changelog.match(
      new RegExp(`## ${version}[\\s\\S]*?(?=## |$)`),
    );
    if (versionSection) {
      notes += `\n${versionSection[0].replaceAll(`## ${version}`, "")}`;
    } else {
      notes += `\n- Bug fixes and improvements`;
    }
  } catch {
    notes += `\n- Bug fixes and improvements`;
  }

  const notesFile = path.join(__dirname, `../release-notes-${version}.md`);
  // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
  await fs.writeFile(notesFile, notes);

  try {
    await runCommand(
      [
        "gh release create",
        tag,
        "--title",
        `"${title}"`,
        "--notes-file",
        notesFile,
        "--draft",
        "--target",
        "main",
      ].join(" "),
      "Creating GitHub draft release",
    );
  } finally {
    // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
    await fs.unlink(notesFile).catch(() => {});
  }
}

async function main() {
  console.log("Turtle Tracer Release Process");
  console.log("======================================\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (q) => new Promise((res) => rl.question(q, res));

  try {
    const version = await getCurrentVersion();
    console.log(`Current version: ${version}`);

    const proceed = await ask(`Create release v${version}? (y/N): `);
    if (!proceed.toLowerCase().startsWith("y")) {
      console.log("Release cancelled");
      return;
    }

    if (!(await checkGitHubAuth())) return;

    const tagExists = await execAsync(`git rev-parse v${version}`)
      .then(() => true)
      .catch(() => false);

    if (tagExists) {
      console.log(`Tag v${version} already exists`);
    } else {
      const createTag = await ask(`Create git tag v${version}? (y/N): `);
      if (!createTag.toLowerCase().startsWith("y")) {
        console.log("Tag creation skipped");
        return;
      }

      await runCommand(
        `git tag -a v${version} -m "Release ${version}"`,
        "Creating git tag",
      );
      await runCommand(`git push origin v${version}`, "Pushing git tag");
    }

    const createRelease = await ask(
      `Create GitHub draft release for v${version}? (y/N): `,
    );

    if (createRelease.toLowerCase().startsWith("y")) {
      await createGitHubRelease(version);
      console.log(
        "Draft release created: https://github.com/Mallen220/TurtleTracer/releases",
      );
    } else {
      console.log("GitHub release creation skipped");
    }

    console.log("Release process complete");
  } catch (error) {
    console.error("Release failed:", error.message);
  } finally {
    rl.close();
  }
}

main();
