// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The Kotlin versions of classSections.ts: the parts of a generated class that
// are the same whichever command library it is written for.
import type { SequentialClassParts } from "./types";
import { PEDRO_IMPORTS } from "./pedroImports";

/**
 * Java import lines as Kotlin ones. Kotlin imports a Java static method like
 * any other name, and needs no semicolons.
 */
export function kotlinImports(javaImports: string): string {
  return javaImports
    .replaceAll("import static ", "import ")
    .replaceAll(/;$/gm, "");
}

/**
 * A lambda for a command. `body` is an expression or a `{ ... }` block,
 * which in Kotlin already is a lambda.
 */
export function kotlinLambda(body: string): string {
  const trimmed = body.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}")
    ? trimmed
    : `{ ${trimmed} }`;
}

/** The banner, package line and the imports shared by every library. */
export function fileHeader(p: SequentialClassParts): string {
  return `${p.warning}

package ${p.packageName}

${kotlinImports(PEDRO_IMPORTS)}
${p.imports}`;
}

/** The pose factory and tracker, then the poses and path chains. */
export function fields(p: SequentialClassParts, extraField = ""): string {
  return `    private val p = PoseFactory.degrees()${p.trackerField}${extraField}

    // Poses
${p.poseDeclarations}

    // Path chains
${p.pathChainDeclarations}`;
}

/** What the init block does before the library starts building commands. */
export function constructorSetup(p: SequentialClassParts): string {
  return `        ${p.ppReaderInit}${p.eventBindingCode}

        // Load poses
${p.poseInitializations}

        follower.setPose(startPoint)`;
}

export function buildPathsMethod(p: SequentialClassParts): string {
  return `    fun buildPaths() {
        ${p.pathBuilders}
    }`;
}
