// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The parts of a generated class that are the same whichever command library
// it is written for. Each library's template wraps them in its own imports,
// class declaration, constructor signature and command wiring.
import type { SequentialClassParts } from "./types";
import { PEDRO_IMPORTS } from "./pedroImports";
import {
  MIRRORING_IMPORTS,
  RECORD_ALLIANCE_IMPORTS,
  contextForDrawnFor,
  recordAllianceCode,
  recordContextCode,
} from "../javaFormat";

/** The TurtleTracerLib auto imports the class needs, if any (Java form). */
export function allianceImports(p: SequentialClassParts): string[] {
  const imports = p.drawnFor
    ? MIRRORING_IMPORTS
    : p.recordAlliance
      ? RECORD_ALLIANCE_IMPORTS
      : [];
  if (!p.autoAnnotation) return imports;
  // The annotation names its mirror policy whenever the class has an alliance.
  const annotationImports = [
    "import com.turtletracerlib.auto.TurtleAuto",
    ...(imports.length ? ["import com.turtletracerlib.auto.MirrorPolicy"] : []),
  ];
  return [...new Set([...imports, ...annotationImports])];
}

/** The banner, package line and the imports shared by every library. */
export function fileHeader(p: SequentialClassParts): string {
  return `${p.warning}

package ${p.packageName};

${PEDRO_IMPORTS}${allianceImports(p)
    .map((line) => `\n${line};`)
    .join("")}
${p.imports}`;
}

/**
 * The constructor's last parameter when the export mirrors for the alliance,
 * after the others: `, AutoContext autoContext`.
 */
export function contextParam(p: SequentialClassParts): string {
  return p.drawnFor ? ", AutoContext autoContext" : "";
}

/** How the constructor is called in a doc comment, e.g. `(follower, hardwareMap, ctx)`. */
export function constructorArgs(p: SequentialClassParts, args: string): string {
  return p.drawnFor ? `(${args}, ctx)` : `(${args})`;
}

/** The fields: the follower, pose factory and tracker, then the poses and path chains. */
export function fields(p: SequentialClassParts, extraField = ""): string {
  const ctxField = p.drawnFor
    ? `\n    private final AutoContext ctx; // The driver's alliance, for paths drawn for ${p.drawnFor}`
    : "";
  return `    private final Follower follower;${ctxField}
    private final PoseFactory p = PoseFactory.degrees();${p.trackerField}${extraField}

    // Poses
${p.poseDeclarations}

    // Path chains
${p.pathChainDeclarations}`;
}

/** What the constructor does before the library starts building commands. */
export function constructorSetup(p: SequentialClassParts): string {
  const ctx = p.drawnFor
    ? `\n        // Drawn for the ${p.drawnFor === "BLUE" ? "blue" : "red"} alliance, and mirrored when the driver picks the other one.\n        this.ctx = ${contextForDrawnFor(p.drawnFor)};\n        ${recordContextCode(false)}`
    : "";
  const record = p.recordAlliance
    ? `\n        ${recordAllianceCode(p.recordAlliance, false)}`
    : "";
  return `        this.follower = follower;${ctx}${record}

        ${p.ppReaderInit}${p.eventBindingCode}

        // Load poses
${p.poseInitializations}

        follower.setPose(startPoint);`;
}

export function buildPathsMethod(p: SequentialClassParts): string {
  return `    public void buildPaths() {
        ${p.pathBuilders}
    }`;
}

/** The FTC coordinate and metric unit helpers, empty when the export doesn't use them. */
export function helperMethods(p: SequentialClassParts): string {
  return `    ${p.ftcPoseHelper}
    ${p.metricHelper}`;
}
