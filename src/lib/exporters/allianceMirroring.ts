// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Each project says which alliance its paths are drawn for (NONE until the
// team picks one, so exported code never needs TurtleTracerLib unless asked)
// and whether they may be mirrored onto the other alliance.
// Both are kept in the project's extraData, so they are saved with the .turt
// file and travel with it. How the field is mirrored is a season-wide setting.

/** An alliance a project's paths can be drawn for. */
export type DrawnFor = "RED" | "BLUE";

/** The alliance a project is drawn for, or NONE when it has none set. */
export type ProjectSide = DrawnFor | "NONE";

/** The extraData key a project's alliance settings are stored under. */
export const MIRRORING_KEY = "allianceMirroring";

/** A project's alliance settings. */
export interface ProjectAlliance {
  /** The alliance the paths are drawn for; NONE when none is set. */
  drawnFor: ProjectSide;
  /**
   * Whether exported code mirrors the paths when the other alliance is
   * picked. Never true without an alliance to mirror from.
   */
  mirror: boolean;
}

export const DEFAULT_PROJECT_ALLIANCE: ProjectAlliance = {
  drawnFor: "NONE",
  mirror: false,
};

/** What exported code needs to know about a project with an alliance set. */
export interface ExportAlliance {
  /** The alliance the paths are drawn for. */
  drawnFor: DrawnFor;
  /** Mirror for the other alliance; otherwise the code only records its alliance. */
  mirror: boolean;
}

/** The other alliance. */
export const otherAlliance = (a: DrawnFor): DrawnFor =>
  a === "RED" ? "BLUE" : "RED";

/** A project's alliance settings, with the defaults for anything it doesn't say. */
export function projectAlliance(
  extraData: Record<string, any> | null | undefined,
): ProjectAlliance {
  const stored = extraData?.[MIRRORING_KEY];
  const drawnFor: ProjectSide =
    stored?.drawnFor === "RED" || stored?.drawnFor === "BLUE"
      ? stored.drawnFor
      : "NONE";
  return { drawnFor, mirror: drawnFor !== "NONE" && stored?.mirror === true };
}

/**
 * The alliance the project is drawn for when its exported code mirrors for
 * the other alliance, or undefined when it doesn't mirror.
 */
export function projectMirroring(
  extraData: Record<string, any> | null | undefined,
): DrawnFor | undefined {
  const { drawnFor, mirror } = projectAlliance(extraData);
  return mirror && drawnFor !== "NONE" ? drawnFor : undefined;
}

/**
 * The project's alliance for exported code, or undefined when none is set, in
 * which case the code doesn't use TurtleTracerLib for it at all.
 */
export function projectExportAlliance(
  extraData: Record<string, any> | null | undefined,
): ExportAlliance | undefined {
  const { drawnFor, mirror } = projectAlliance(extraData);
  return drawnFor === "NONE" ? undefined : { drawnFor, mirror };
}

/**
 * extraData with some of the project's alliance settings changed. Returns a
 * new object; other keys are kept. The defaults aren't written, so a project
 * that never changes them doesn't gain anything in its file.
 */
export function withProjectAlliance(
  extraData: Record<string, any> | null | undefined,
  change: Partial<ProjectAlliance>,
): Record<string, any> {
  const next = { ...projectAlliance(extraData), ...change };
  // Without an alliance there is nothing to mirror from.
  if (next.drawnFor === "NONE") next.mirror = false;
  const { [MIRRORING_KEY]: _old, ...rest } = extraData ?? {};
  const isDefault =
    next.drawnFor === DEFAULT_PROJECT_ALLIANCE.drawnFor &&
    next.mirror === DEFAULT_PROJECT_ALLIANCE.mirror;
  return isDefault ? rest : { ...rest, [MIRRORING_KEY]: next };
}
