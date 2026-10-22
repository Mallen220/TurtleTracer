// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Writes the generated-code examples that the docs show, by running the app's
// own exporters on a fixed sample project. The docs import these files, so the
// examples can't drift from what Turtle Tracer really writes.
//
//   npm run docs:examples                  write into ../TurtleTracerDocs/src/examples
//   npm run docs:examples -- <dir>         write into <dir>
//   npm run docs:examples -- --check       write nothing; exit 1 if the files are stale
//
// Every language and command library is covered without listing them here:
// languages come from LANGUAGES below, libraries from COMMAND_LIBRARIES.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CodeLanguage,
  EventMarker,
  Line,
  Point,
  SequenceItem,
} from "../src/types";

// The app's stores expect a browser. A bare `window` is all the exporters need,
// so it's set up here and the app is loaded after, with dynamic imports.
globalThis.window ??= globalThis as unknown as Window & typeof globalThis;

const { generateJavaCode } = await import("../src/lib/exporters/javaExporter");
const { generateSequentialCommandCode } =
  await import("../src/lib/exporters/sequentialExporter");
const { COMMAND_LIBRARIES } =
  await import("../src/lib/exporters/commandLibraries");
const { registerCoreUI } = await import("../src/lib/coreRegistrations");

const LANGUAGES: { id: CodeLanguage; extension: string }[] = [
  { id: "java", extension: "java" },
  { id: "kotlin", extension: "kt" },
];

const PACKAGE_NAME = "org.firstinspires.ftc.teamcode";
const SEQUENTIAL_PACKAGE_NAME = `${PACKAGE_NAME}.Commands.AutoCommands`;

interface SampleProject {
  /** Start of every file name written for this project. */
  name: string;
  startPoint: Point;
  lines: Line[];
  sequence: SequenceItem[];
  /** The project file the sequential export reads its poses from. */
  fileName: string;
  /** Whether the command-library examples are written too. */
  commandLibraries: boolean;
}

const marker = (id: string, name: string, position: number): EventMarker => ({
  id,
  name,
  type: "parametric",
  position,
});

/** One path. Used where a docs page needs the smallest possible OpMode. */
const simple: SampleProject = {
  name: "simple",
  startPoint: { x: 56, y: 8, heading: "linear", startDeg: 90, endDeg: 180 },
  lines: [
    {
      id: "a",
      name: "line1",
      color: "#a78bfa",
      controlPoints: [],
      endPoint: {
        x: 56,
        y: 36,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
        reverse: false,
      },
    },
  ],
  sequence: [{ kind: "path", lineId: "a" }],
  fileName: "AutoPath.turt",
  commandLibraries: false,
};

/** Three paths with a wait, and event markers on the first and last path. */
const routine: SampleProject = {
  name: "routine",
  startPoint: { x: 9, y: 25, heading: "linear", startDeg: 0, endDeg: 45 },
  lines: [
    {
      id: "a",
      name: "DriveToShoot",
      color: "#a78bfa",
      controlPoints: [{ x: 28, y: 22 }],
      endPoint: {
        x: 48,
        y: 48,
        heading: "linear",
        startDeg: 0,
        endDeg: 45,
        reverse: false,
      },
      eventMarkers: [marker("m1", "SpinUp", 0.4)],
    },
    {
      id: "b",
      name: "CollectRow1",
      color: "#34d399",
      controlPoints: [{ x: 30, y: 58 }],
      endPoint: { x: 34, y: 78, heading: "tangential", reverse: false },
    },
    {
      id: "c",
      name: "ReturnToShoot",
      color: "#f472b6",
      controlPoints: [],
      endPoint: {
        x: 48,
        y: 48,
        heading: "linear",
        startDeg: 90,
        endDeg: 45,
        reverse: false,
      },
      eventMarkers: [marker("m2", "Intake", 0.5)],
    },
  ],
  sequence: [
    { kind: "path", lineId: "a" },
    { kind: "wait", id: "w1", name: "", durationMs: 1500 },
    { kind: "path", lineId: "b" },
    { kind: "path", lineId: "c" },
  ],
  fileName: "AutoPath.turt",
  commandLibraries: true,
};

const PROJECTS = [simple, routine];

/** The code from its `package` line on, without the generated-file banner. */
function withoutBanner(code: string): string {
  const lines = code.split("\n");
  const start = lines.findIndex((line) => line.startsWith("package "));
  return `${lines.slice(Math.max(start, 0)).join("\n").trimEnd()}\n`;
}

/** Every example to write, as file name and contents. */
async function generateExamples(): Promise<Map<string, string>> {
  registerCoreUI();
  const files = new Map<string, string>();

  for (const project of PROJECTS) {
    for (const { id: language, extension } of LANGUAGES) {
      // The plain OpMode, which needs no command library.
      files.set(
        `${project.name}-opmode.${extension}`,
        withoutBanner(
          await generateJavaCode(
            project.startPoint,
            project.lines,
            true,
            project.sequence,
            PACKAGE_NAME,
            "Panels",
            "Pedro",
            "imperial",
            null,
            language,
          ),
        ),
      );

      if (!project.commandLibraries) continue;
      for (const library of COMMAND_LIBRARIES) {
        files.set(
          `${project.name}-${library.id.toLowerCase()}.${extension}`,
          withoutBanner(
            await generateSequentialCommandCode(
              project.startPoint,
              project.lines,
              project.fileName,
              project.sequence,
              library.id,
              SEQUENTIAL_PACKAGE_NAME,
              false,
              "Pedro",
              "imperial",
              language,
            ),
          ),
        );
      }
    }
  }
  return files;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const givenDir = args.find((arg) => !arg.startsWith("--"));
  const outDir = path.resolve(
    givenDir ?? path.join(scriptDir, "../../TurtleTracerDocs/src/examples"),
  );
  if (!givenDir && !fs.existsSync(path.dirname(outDir))) {
    console.error(
      `${path.dirname(outDir)} not found. Pass the output folder: npm run docs:examples -- <dir>`,
    );
    process.exit(1);
  }

  const files = await generateExamples();

  if (check) {
    const stale = [...files].filter(([name, code]) => {
      const file = path.join(outDir, name);
      return !fs.existsSync(file) || fs.readFileSync(file, "utf8") !== code;
    });
    if (stale.length > 0) {
      console.error(
        `${stale.length} example(s) in ${outDir} are out of date:\n` +
          stale.map(([name]) => `  ${name}`).join("\n") +
          "\nRun: npm run docs:examples",
      );
      process.exit(1);
    }
    console.log(`${files.size} examples in ${outDir} are up to date.`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  let changed = 0;
  for (const [name, code] of files) {
    const file = path.join(outDir, name);
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === code) continue;
    fs.writeFileSync(file, code);
    changed++;
  }
  console.log(
    `${files.size} examples in ${outDir} (${changed} written, ${files.size - changed} unchanged).`,
  );
}

await main();
// The app's modules leave timers running, which would keep the script open.
process.exit(0);
