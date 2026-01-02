// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const noticeFile = path.join(rootDir, "NOTICE");

/**
 * Gets files that have been edited, deleted, or created.
 * Uses git to determine which files have been modified, added, or deleted.
 */
function getModifiedFiles() {
  try {
    let output = "";

    try {
      // Get unstaged changes
      const unstaged = execSync("git diff --name-only", {
        cwd: rootDir,
        encoding: "utf8",
      }).trim();
      output += unstaged;

      // Get staged changes
      const staged = execSync("git diff --cached --name-only", {
        cwd: rootDir,
        encoding: "utf8",
      }).trim();
      if (staged) {
        output += (output ? "\n" : "") + staged;
      }

      // Get untracked files
      const untracked = execSync("git ls-files --others --exclude-standard", {
        cwd: rootDir,
        encoding: "utf8",
      }).trim();
      if (untracked) {
        output += (output ? "\n" : "") + untracked;
      }
    } catch (error) {
      console.error("Error executing git commands:", error.message);
      return [];
    }

    if (!output) {
      return [];
    }

    // Split, trim, and deduplicate file paths
    const files = [...new Set(output.split("\n").filter((f) => f.trim()))];

    // Sort for consistent output
    files.sort();

    return files;
  } catch (error) {
    console.error("Error getting modified files:", error.message);
    return [];
  }
}

/**
 * Appends new files to the NOTICE file without duplicates.
 */
async function appendToNotice() {
  try {
    const newFiles = getModifiedFiles();

    if (newFiles.length === 0) {
      console.log("ℹ️ No modified, added, or untracked files found.");
      return;
    }

    // Read existing NOTICE file
    let noticeContent = "";
    try {
      noticeContent = await fs.readFile(noticeFile, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      // File doesn't exist, start with empty content
    }

    // Extract existing files (lines that start after the header)
    const lines = noticeContent.split("\n");
    const existingFiles = new Set();
    let headerEndIndex = 0;

    // Find where the header ends (look for blank line or the start of file list)
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes("These files have been edited") ||
        lines[i].trim() === ""
      ) {
        headerEndIndex = i + 1;
        break;
      }
    }

    // Collect existing files
    for (let i = headerEndIndex; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed) {
        existingFiles.add(trimmed);
      }
    }

    // Find files to add (not already in the notice)
    const filesToAdd = newFiles.filter((f) => !existingFiles.has(f));

    if (filesToAdd.length === 0) {
      console.log("✅ All files already documented in NOTICE.");
      return;
    }

    // Build the updated content
    let updatedContent = noticeContent.trimEnd();

    // Add header if this is the first time
    if (!updatedContent.includes("These files have been edited")) {
      updatedContent += "\n\nThese files have been edited, deleted, or created by Matthew Allen:\n";
    } else {
      updatedContent += "\n";
    }

    // Add new files
    filesToAdd.forEach((file) => {
      updatedContent += file + "\n";
    });

    // Write back to file
    await fs.writeFile(noticeFile, updatedContent);

    console.log(`✅ Added ${filesToAdd.length} file(s) to NOTICE:`);
    filesToAdd.forEach((f) => console.log(`   - ${f}`));
  } catch (error) {
    console.error("Error appending to NOTICE:", error.message);
    process.exit(1);
  }
}

// Main execution
appendToNotice();
