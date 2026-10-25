// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The parts of a generated class that are the same whichever command library
// it is written for. Each library's template wraps them in its own imports,
// class declaration, constructor signature and command wiring.
import type { SequentialClassParts } from "./types";
import { PEDRO_IMPORTS } from "./pedroImports";

/** The banner, package line and the imports shared by every library. */
export function fileHeader(p: SequentialClassParts): string {
  return `${p.warning}

package ${p.packageName};

${PEDRO_IMPORTS}
${p.imports}`;
}

/** The fields: the follower, pose factory and tracker, then the poses and path chains. */
export function fields(p: SequentialClassParts, extraField = ""): string {
  return `    private final Follower follower;
    private final PoseFactory p = PoseFactory.degrees();${p.trackerField}${extraField}

    // Poses
${p.poseDeclarations}

    // Path chains
${p.pathChainDeclarations}`;
}

/** What the constructor does before the library starts building commands. */
export function constructorSetup(p: SequentialClassParts): string {
  return `        this.follower = follower;

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
    ${p.metricHelper}
    ${p.headingHelper}`;
}
