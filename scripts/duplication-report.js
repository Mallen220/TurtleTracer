// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const reportDir = path.join(rootDir, "tmp/jscpd");
const reportFile = path.join(reportDir, "jscpd-report.json");
const outputFile = path.join(rootDir, "DuplicationReport.txt");

function getContext(filePath, startLine, endLine, contextLines = 2) {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(rootDir, filePath);
  if (!fs.existsSync(absolutePath)) return `File not found: ${filePath}`;

  const content = fs.readFileSync(absolutePath, "utf-8").split("\n");
  const start = Math.max(0, startLine - contextLines - 1);
  const end = endLine;

  const result = [];
  for (let i = start; i < end; i++) {
    const lineNum = i + 1;
    result.push(`${lineNum} ${content[i]}`);
  }
  return result.join("\n");
}

async function run() {
  console.log("Running duplication check...");

  try {
    // Ensure tmp directory exists
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Run jscpd
    // Execute jscpd
    // We restrict to typescript and javascript as per ..yaml to match the expected count
    try {
      execSync(
        `npx jscpd src --reporters json --output tmp/jscpd --threshold 0 --min-tokens 40 --format typescript,javascript`,
        { stdio: "pipe" },
      );
    } catch {
      // jscpd returns exit code 1 if duplicates are found, which is expected
    }

    const reportFile = path.join(process.cwd(), "tmp/jscpd/jscpd-report.json");
    if (!fs.existsSync(reportFile)) {
      console.error("Error: jscpd report was not generated.");
      process.exit(1);
    }

    const report = JSON.parse(fs.readFileSync(reportFile, "utf-8"));
    const duplicates = report.duplicates || [];

    if (duplicates.length === 0) {
      const emptyReport = "Duplication\n0 clones found.\n";
      fs.writeFileSync(
        path.join(process.cwd(), "DuplicationReport.txt"),
        emptyReport,
      );
      console.log(emptyReport);
      return;
    }

    // Clustering logic to find unique clones (instances) across all duplication events
    const clusters = [];
    duplicates.forEach(({ firstFile, secondFile }) => {
      const loc1 = `${firstFile.name}:${firstFile.startLoc.line}-${firstFile.endLoc.line}`;
      const loc2 = `${secondFile.name}:${secondFile.startLoc.line}-${secondFile.endLoc.line}`;

      let cluster1 = clusters.find((c) => c.has(loc1));
      let cluster2 = clusters.find((c) => c.has(loc2));

      if (cluster1 && cluster2) {
        if (cluster1 !== cluster2) {
          cluster2.forEach((loc) => cluster1.add(loc));
          clusters.splice(clusters.indexOf(cluster2), 1);
        }
      } else if (cluster1) {
        cluster1.add(loc2);
      } else if (cluster2) {
        cluster2.add(loc1);
      } else {
        clusters.push(new Set([loc1, loc2]));
      }
    });

    let totalClones = 0;
    clusters.forEach((c) => (totalClones += c.size));

    const uniqueFiles = new Set();
    duplicates.forEach((d) => {
      uniqueFiles.add(d.firstFile.name);
      uniqueFiles.add(d.secondFile.name);
    });

    let output = "Duplication\n";
    output += `${totalClones} clones in ${uniqueFiles.size} files\n\n`;

    for (const clone of duplicates) {
      const files = [clone.firstFile, clone.secondFile];
      for (const file of files) {
        output += `${file.name}\n`;
        output += ` : ${file.startLoc.line} - ${file.endLoc.line}\n\n`;
        output += getContext(file.name, file.startLoc.line, file.endLoc.line);
        output += "\n\n";
      }
      output += "-------------------------------------------\n\n";
    }

    console.log(output);
    fs.writeFileSync(outputFile, output);
    console.log(`Report saved to ${outputFile}`);
  } catch (error) {
    console.error("Error generating report:", error);
    process.exit(1);
  }
}

run();
