// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What Turtle Tracer can tell about the team's robot project (the FTC project
// its paths folder sits in) from the project's own files: where the Pedro
// constants class is and what its follower factory is called, so the code
// written for the team compiles as it is; which Pedro and command library it
// builds with; and numbers the simulation can use, like Pedro's brake model.

import type { CommandLibraryId, Settings } from "../types";

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

/** Pedro's brake model from the constants (ForesightConfig coefficients). */
export interface BrakeCoefficients {
  quadraticForward: number;
  quadraticStrafe: number;
  linearForward: number;
  linearStrafe: number;
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
  brakeCoefficients: BrakeCoefficients | null;
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

const join = (dir: string, file: string) =>
  dir.replace(/[\\/]+$/, "") + "/" + file;

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

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;

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
  const packageName = /^\s*package\s+([\w.]+)/m.exec(content)?.[1];
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

/** Pedro's brake coefficients in a constants file, if it sets them. */
export function readBrakeCoefficients(
  content: string,
): BrakeCoefficients | null {
  const pair = (name: string) => {
    const match = new RegExp(
      String.raw`${name}[^;]*?Matrix\.diag\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*\)`,
    ).exec(content);
    return match ? [Number(match[1]), Number(match[2])] : null;
  };
  const quadratic = pair("quadraticBrakeCoefficients");
  const linear = pair("linearBrakeCoefficients");
  if (!quadratic || !linear) return null;
  return {
    quadraticForward: quadratic[0],
    quadraticStrafe: quadratic[1],
    linearForward: linear[0],
    linearStrafe: linear[1],
  };
}

/** What a project's build files say about Pedro and its command library. */
export function readBuildFiles(contents: string[]): {
  pedroVersion: "v2" | "v3" | null;
  pedroDependency: string | null;
  commandLibrary: CommandLibraryId | null;
} {
  const text = contents
    .map((c) => c.replaceAll(/^\s*\/\/.*$/gm, ""))
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
    brakeCoefficients: constants
      ? readBrakeCoefficients(contents.get(constants.file) ?? "")
      : null,
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

const sameNumber = (a: number | undefined, b: number) =>
  Math.abs((a ?? 0) - b) < 1e-9;

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

  const brakes = project.brakeCoefficients;
  if (
    brakes &&
    !(
      sameNumber(
        settings.pedroQuadraticBrakeForward,
        brakes.quadraticForward,
      ) &&
      sameNumber(settings.pedroQuadraticBrakeStrafe, brakes.quadraticStrafe) &&
      sameNumber(settings.pedroLinearBrakeForward, brakes.linearForward) &&
      sameNumber(settings.pedroLinearBrakeStrafe, brakes.linearStrafe)
    )
  ) {
    const pair = (a: number | undefined, b: number | undefined) =>
      `${a ?? 0}, ${b ?? 0}`;
    suggestions.push({
      id: "handoverBrakes",
      label: "Handover brake coefficients",
      found: `quadratic ${pair(brakes.quadraticForward, brakes.quadraticStrafe)}; linear ${pair(brakes.linearForward, brakes.linearStrafe)}`,
      current: `quadratic ${pair(settings.pedroQuadraticBrakeForward, settings.pedroQuadraticBrakeStrafe)}; linear ${pair(settings.pedroLinearBrakeForward, settings.pedroLinearBrakeStrafe)}`,
      patch: {
        pedroQuadraticBrakeForward: brakes.quadraticForward,
        pedroQuadraticBrakeStrafe: brakes.quadraticStrafe,
        pedroLinearBrakeForward: brakes.linearForward,
        pedroLinearBrakeStrafe: brakes.linearStrafe,
      },
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
