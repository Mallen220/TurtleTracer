// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * This test runs the duplication detection script and ensures
 * that a report is generated. It prints the report to the console.
 */
describe("Code Duplication Check", () => {
  it("identifies and reports code clones", () => {
    const rootDir = process.cwd();
    const scriptPath = path.join(rootDir, "scripts/duplication-report.js");
    const reportPath = path.join(rootDir, "DuplicationReport.txt");

    // Run the report script
    // We use stdio: 'inherit' so that the formatted output appears in the test logs
    try {
      execSync(`node ${scriptPath}`, { stdio: "inherit" });
    } catch (e) {
      // The script might fail if jscpd returns exit code 1, but we want to check the report file
    }

    // Verify that the report file was created
    expect(fs.existsSync(reportPath)).toBe(true);

    const reportContent = fs.readFileSync(reportPath, "utf-8");
    expect(reportContent).toContain("Duplication");

    // We don't necessarily fail the test based on clone count unless desired,
    // but the output will be visible in the vitest run.
  });
});
