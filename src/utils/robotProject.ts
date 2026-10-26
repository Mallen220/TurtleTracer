// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What Turtle Tracer can tell about the team's robot project (the FTC project
// its paths folder sits in) from the project's own files: where the Pedro
// constants class is and what its follower factory is called, so the code
// written for the team compiles as it is; which Pedro and command library it
// builds with; and the numbers the simulation can use, like Pedro's speeds and
// brake model, which pedroConstantsReader reads.

import type { CommandLibraryId, Settings } from "../types";
import {
  changedValues,
  readPedroValues,
  type PedroValue,
  type PedroValueKey,
  type ValueChange,
} from "./pedroConstantsReader";

export interface PedroConstantsClass {
  /** The class's full name, as the import line needs it. */
  qualifiedName: string;
  className: string;
  /** The static method that builds the Follower, such as `createFollower`. */
  followerFactory: string | null;
  /** Whether it has the `foresightConfig` speed limits are set through. */
  hasForesightConfig: boolean;
  /** The file it is in. */
  file: string;
}

export interface RobotProject {
  /** The project's folder: the one holding TeamCode. */
  root: string;
  constants: PedroConstantsClass | null;
  /** Pedro's major version, from the build files. */
  pedroVersion: "v2" | "v3" | null;
  /** The Pedro dependency it came from, such as `com.pedropathing:revhub:3.0.2`. */
  pedroDependency: string | null;
  commandLibrary: CommandLibraryId | null;
  /** What the constants file sets that there is a setting for. */
  pedroValues: PedroValue[];
}

/** Build files that list a project's dependencies, from its root. */
export const BUILD_FILES = [
  "TeamCode/build.gradle",
  "TeamCode/build.gradle.kts",
  "build.dependencies.gradle",
  "build.gradle",
];

/** Where a project's own code is, from its root. */
export const SOURCE_FOLDER = "TeamCode/src/main";

/** Files that may hold the Pedro constants. */
export const CONSTANTS_FILE_ENDINGS = ["Constants.java", "Constants.kt"];

const join = (dir: string, file: string) => {
  let end = dir.length;
  while (end > 0 && (dir[end - 1] === "/" || dir[end - 1] === "\\")) end--;
  return dir.slice(0, end) + "/" + file;
};

/**
 * The FTC project a folder is in: the folder holding TeamCode, if the folder
 * is inside TeamCode, or itself if it holds TeamCode. Null if neither.
 */
export async function findProjectRoot(
  directory: string,
  fileExists: (path: string) => Promise<boolean>,
): Promise<string | null> {
  const parts = directory.replaceAll("\\", "/").split("/");
  const teamCode = parts.indexOf("TeamCode");
  if (teamCode > 0) return parts.slice(0, teamCode).join("/");
  return (await fileExists(join(directory, "TeamCode"))) ? directory : null;
}

/**
 * The Pedro constants class in a Java or Kotlin file, or null if the file's
 * class isn't one: it builds a Follower, or holds Pedro's configuration.
 */
export function readConstantsClass(
  file: string,
  content: string,
): PedroConstantsClass | null {
  const kotlin = file.endsWith(".kt");
  const factory = kotlin
    ? /fun\s+(\w+)\s*\(\s*\w+\s*:\s*HardwareMap\s*\)\s*(?::\s*Follower\b|=\s*Follower\s*\()/.exec(
        content,
      )
    : /static\s+(?:final\s+)?Follower\s+(\w+)\s*\(\s*(?:final\s+)?HardwareMap\b/.exec(
        content,
      );
  const hasForesightConfig = /\bforesightConfig\b/.test(content);
  const isPedro =
    factory !== null ||
    /\b(ForesightConfig|FollowerConstants|PathConstraints)\b/.test(content);
  if (!isPedro) return null;

  const className =
    /(?:class|object)\s+(\w*Constants)\b/.exec(content)?.[1] ??
    file
      .split(/[\\/]/)
      .pop()!
      .replace(/\.(java|kt)$/, "");
  const packageName = /^[ \t]*package[ \t]+([\w.]+)/m.exec(content)?.[1];
  return {
    qualifiedName: packageName ? `${packageName}.${className}` : className,
    className,
    followerFactory: factory?.[1] ?? null,
    hasForesightConfig,
    file,
  };
}

/**
 * Which of several constants classes the code should use: the one that builds
 * the Follower, then the one with `foresightConfig`, then one in a folder
 * named for Pedro.
 */
export function pickConstantsClass(
  found: PedroConstantsClass[],
): PedroConstantsClass | null {
  const score = (c: PedroConstantsClass) =>
    (c.followerFactory ? 4 : 0) +
    (c.hasForesightConfig ? 2 : 0) +
    (/pedro/i.test(c.qualifiedName) ? 1 : 0);
  return found.toSorted((a, b) => score(b) - score(a))[0] ?? null;
}

/** What a project's build files say about Pedro and its command library. */
export function readBuildFiles(contents: string[]): {
  pedroVersion: "v2" | "v3" | null;
  pedroDependency: string | null;
  commandLibrary: CommandLibraryId | null;
} {
  const text = contents
    .map((c) => c.replaceAll(/^[ \t]*\/\/.*$/gm, ""))
    .join("\n");
  const pedro =
    /com\.pedropathing:(?!ivy\b|telemetry\b|tuning\b)([\w-]+):(\d+)[\w.+-]*/.exec(
      text,
    );
  const major = pedro ? Number(pedro[2]) : null;
  const commandLibrary: CommandLibraryId | null = /org\.solverslib:/.test(text)
    ? "SolversLib"
    : /dev\.nextftc[.:]/.test(text)
      ? "NextFTC"
      : /com\.pedropathing(?:\.ivy:|:ivy:)/.test(text)
        ? "Ivy"
        : null;
  return {
    pedroVersion: major === null ? null : major >= 3 ? "v3" : "v2",
    pedroDependency: pedro?.[0] ?? null,
    commandLibrary,
  };
}

export interface ProjectFiles {
  fileExists: (path: string) => Promise<boolean>;
  readFile: (path: string) => Promise<string>;
  findFiles?: (
    root: string,
    endings: string[],
    options?: { maxDepth?: number; maxResults?: number },
  ) => Promise<string[]>;
}

/** Everything that can be told about the robot project `directory` is in. */
export async function detectRobotProject(
  directory: string,
  files: ProjectFiles,
): Promise<RobotProject | null> {
  const root = await findProjectRoot(directory, files.fileExists);
  if (!root) return null;
  const read = (path: string) => files.readFile(path).catch(() => "");

  const builds: string[] = [];
  for (const name of BUILD_FILES) {
    const path = join(root, name);
    if (await files.fileExists(path).catch(() => false)) {
      builds.push(await read(path));
    }
  }

  const candidates = files.findFiles
    ? await files
        .findFiles(join(root, SOURCE_FOLDER), CONSTANTS_FILE_ENDINGS, {
          maxResults: 40,
        })
        .catch(() => [])
    : [];
  const classes: PedroConstantsClass[] = [];
  const contents = new Map<string, string>();
  for (const file of candidates) {
    const content = await read(file);
    const found = readConstantsClass(file, content);
    if (found) {
      classes.push(found);
      contents.set(file, content);
    }
  }
  const constants = pickConstantsClass(classes);

  return {
    root,
    constants,
    ...readBuildFiles(builds),
    pedroValues: constants
      ? readPedroValues(contents.get(constants.file) ?? "").values
      : [],
  };
}

/** A setting the robot project says should be different. */
export interface ProjectSuggestion {
  id: string;
  /** What it is, for a list: "Pedro Pathing version". */
  label: string;
  /** What the project has, and what the setting is now. */
  found: string;
  current: string;
  patch: Partial<Settings>;
}

const BRAKE_KEYS: PedroValueKey[] = [
  "pedroQuadraticBrakeForward",
  "pedroQuadraticBrakeStrafe",
  "pedroLinearBrakeForward",
  "pedroLinearBrakeStrafe",
];

/** A number for a sentence: Pedro's tuned values run to 16 digits. */
export const shortNumber = (n: number | string) =>
  typeof n === "number" ? Number(n.toPrecision(5)) : n;

/** The settings that don't match what the robot project says. */
export function projectSuggestions(
  project: RobotProject | null,
  settings: Settings,
): ProjectSuggestion[] {
  if (!project) return [];
  const suggestions: ProjectSuggestion[] = [];

  if (
    project.pedroVersion &&
    project.pedroVersion !== (settings.pedroVersion ?? "v3")
  ) {
    suggestions.push({
      id: "pedroVersion",
      label: "Pedro Pathing version",
      found: `${project.pedroVersion} (${project.pedroDependency})`,
      current: settings.pedroVersion ?? "v3",
      patch: { pedroVersion: project.pedroVersion },
    });
  }

  const changes = changedValues(project.pedroValues, settings);
  const brakes = changes.filter((c) =>
    BRAKE_KEYS.includes(c.setting as PedroValueKey),
  );
  if (brakes.length > 0) {
    // All four are set together: they only mean something as a set.
    const all = project.pedroValues.filter((v) =>
      BRAKE_KEYS.includes(v.setting),
    );
    const pair = (a: PedroValueKey, b: PedroValueKey, from: "now" | "file") => {
      const at = (key: PedroValueKey) =>
        from === "now"
          ? ((settings[key] as number | undefined) ?? 0)
          : (all.find((v) => v.setting === key)?.value ?? 0);
      return `${shortNumber(at(a))}, ${shortNumber(at(b))}`;
    };
    const describe = (from: "now" | "file") =>
      `quadratic ${pair("pedroQuadraticBrakeForward", "pedroQuadraticBrakeStrafe", from)}; linear ${pair("pedroLinearBrakeForward", "pedroLinearBrakeStrafe", from)}`;
    suggestions.push({
      id: "handoverBrakes",
      label: "Handover brake coefficients",
      found: describe("file"),
      current: describe("now"),
      patch: Object.fromEntries(all.map((v) => [v.setting, v.value])),
    });
  }

  const motion = changes.filter(
    (c) => !BRAKE_KEYS.includes(c.setting as PedroValueKey),
  );
  if (motion.length > 0) {
    suggestions.push({
      id: "motionValues",
      label: "Motion values",
      found: motion.map((c) => `${c.label} ${shortNumber(c.value)}`).join(", "),
      current: motion
        .map((c) => `${c.label} ${shortNumber(c.current)}`)
        .join(", "),
      patch: Object.fromEntries(motion.map((c) => [c.setting, c.value])),
    });
  }

  // Only command-based code is written for a library.
  if (
    settings.autoExportFormat === "sequential" &&
    project.commandLibrary &&
    project.commandLibrary !== settings.autoExportTargetLibrary
  ) {
    suggestions.push({
      id: "targetLibrary",
      label: "Command library",
      found: project.commandLibrary,
      current: settings.autoExportTargetLibrary ?? "none",
      patch: { autoExportTargetLibrary: project.commandLibrary },
    });
  }
  return suggestions;
}

/** What a constants file, pasted in whole, would change in the settings. */
export interface PastedConstants {
  /** Whether the text has anything Pedro in it that Turtle Tracer reads. */
  recognised: boolean;
  /** Settings it would change, in the order the Motion tab shows them. */
  changes: ValueChange[];
  /** What it would change, ready to apply. */
  patch: Partial<Settings>;
}

/**
 * Reads a constants file the user pasted. Beyond the numbers, it says which
 * Pedro it is written for and what its class and follower factory are called.
 */
export function readPastedConstants(
  text: string,
  settings: Settings,
): PastedConstants {
  const read = readPedroValues(text);
  const changes = changedValues(read.values, settings);
  let recognised = read.values.length > 0;

  if (read.version) {
    recognised = true;
    const current = settings.pedroVersion ?? "v3";
    if (read.version !== current) {
      changes.unshift({
        setting: "pedroVersion",
        label: "Pedro Pathing version",
        value: read.version,
        current,
        source: "the code's style",
      });
    }
  }

  const constants = readConstantsClass(
    /\bfun\s+\w+\s*\(|^[ \t]*object\s+\w+/m.test(text) ? "x.kt" : "x.java",
    text,
  );
  if (constants) {
    recognised = true;
    const named = (setting: "pedroConstantsClass" | "pedroFollowerFactory") =>
      setting === "pedroConstantsClass"
        ? constants.qualifiedName
        : constants.followerFactory;
    const entries = [
      ["pedroConstantsClass", "Pedro constants class"],
      ["pedroFollowerFactory", "Follower factory method"],
    ] as const;
    for (const [setting, label] of entries) {
      const value = named(setting);
      if (value && value !== (settings[setting] ?? "")) {
        changes.push({
          setting,
          label,
          value,
          current: settings[setting] || "found in the robot project",
          source: "the pasted code",
        });
      }
    }
  }

  return {
    recognised,
    changes,
    patch: Object.fromEntries(changes.map((c) => [c.setting, c.value])),
  };
}
