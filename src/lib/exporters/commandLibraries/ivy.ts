// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibrary } from "./types";
import {
  buildPathsMethod,
  constructorSetup,
  fields,
  fileHeader,
  helperMethods,
} from "./classSections";
import * as kt from "./kotlinClassSections";

const imports = `
import com.pedropathing.ivy.Command;
import com.pedropathing.ivy.commands.Commands;
import com.pedropathing.ivy.groups.Groups;
import com.pedropathing.ivy.pedro.PedroCommands;
`;

const markerImports = (p: { hasEventMarkers: boolean }) =>
  p.hasEventMarkers
    ? "import com.turtletracerlib.pathing.ProgressTracker;\nimport com.turtletracerlib.pathing.NamedCommands;\n"
    : "";

/**
 * Pedro Pathing's Ivy (https://github.com/Pedro-Pathing/Ivy). Commands are
 * built with static factories rather than subclassed, and run by the static
 * Scheduler, so the generated class hands back a Command instead of being one.
 */
export const ivy: CommandLibrary = {
  id: "Ivy",
  label: "Ivy",
  description: "Command-based sequence for Pedro Pathing's Ivy.",
  experimental: true,
  trackerTelemetry: "null",
  java: {
    imports,
    commands: {
      wait: (ms) => `Commands.waitMs(${ms.toFixed(0)})`,
      waitUntil: (condition) => `Commands.waitUntil(() -> ${condition})`,
      instant: (body) => `Commands.instant(() -> ${body})`,
      sequential: (inner) => `Groups.sequential(${inner})`,
      race: (inner) => `Groups.race(${inner})`,
      perpetual: (body) => `Commands.infinite(() -> ${body})`,
      followPath: (path) => `PedroCommands.follow(follower, ${path})`,
    },

    classTemplate: (p) => `
${fileHeader(p)}
${markerImports(p)}${p.ppReaderImport}
import java.io.IOException;

/**
 * Call {@code Scheduler.reset();} in init(), start it with
 * {@code new ${p.className}(follower, hardwareMap).command().schedule();}, and call
 * {@code follower.update();} and {@code Scheduler.execute();} every loop.
 */
public class ${p.className} {

${fields(p)}

    public ${p.className}(final Follower follower, HardwareMap hw) throws IOException {
${constructorSetup(p)}
    }

${buildPathsMethod(p)}

    public Command command() {
        buildPaths();
        return Groups.sequential(
${p.commands}
        );
    }

${helperMethods(p)}
}
`,
  },

  kotlin: {
    imports: kt.kotlinImports(imports),
    commands: {
      // waitMs takes a double, which Kotlin won't make from a whole number.
      wait: (ms) => `Commands.waitMs(${ms.toFixed(0)}.0)`,
      waitUntil: (condition) => `Commands.waitUntil { ${condition} }`,
      instant: (body) => `Commands.instant ${kt.kotlinLambda(body)}`,
      sequential: (inner) => `Groups.sequential(${inner})`,
      race: (inner) => `Groups.race(${inner})`,
      perpetual: (body) => `Commands.infinite ${kt.kotlinLambda(body)}`,
      followPath: (path) => `PedroCommands.follow(follower, ${path})`,
    },

    classTemplate: (p) => `
${kt.fileHeader(p)}
${markerImports(p)}${p.ppReaderImport}

/**
 * Call \`Scheduler.reset()\` in init(), start it with
 * \`${p.className}(follower, hardwareMap).command().schedule()\`, and call
 * \`follower.update()\` and \`Scheduler.execute()\` every loop.
 */
class ${p.className}(
    private val follower: Follower,
    hw: HardwareMap,
) {

${kt.fields(p)}

    init {
${kt.constructorSetup(p)}
    }

${kt.buildPathsMethod(p)}

    fun command(): Command {
        buildPaths()
        return Groups.sequential(
${p.commands}
        )
    }

${helperMethods(p)}
}
`,
  },
};
