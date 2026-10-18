// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibrary } from "./types";
import {
  buildPathsMethod,
  constructorSetup,
  fields,
  fileHeader,
  helperMethods,
} from "./classSections";

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
  imports: `
import com.pedropathing.ivy.Command;
import com.pedropathing.ivy.commands.Commands;
import com.pedropathing.ivy.groups.Groups;
import com.pedropathing.ivy.pedro.PedroCommands;
`,
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
${p.hasEventMarkers ? "import com.turtletracerlib.pathing.ProgressTracker;\nimport com.turtletracerlib.pathing.NamedCommands;\n" : ""}${p.ppReaderImport}
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
};
