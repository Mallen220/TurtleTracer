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
import dev.nextftc.core.commands.Command;
import dev.nextftc.core.commands.groups.SequentialGroup;
import dev.nextftc.core.commands.groups.ParallelRaceGroup;
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.delays.WaitUntil;
import dev.nextftc.core.commands.utility.InstantCommand;
import dev.nextftc.core.commands.utility.LambdaCommand;
`;

const markerImports = (p: { hasEventMarkers: boolean }) =>
  p.hasEventMarkers
    ? "import com.turtletracerlib.pathing.ProgressTracker;\nimport com.turtletracerlib.pathing.NamedCommands;\n"
    : "";

export const nextFtc: CommandLibrary = {
  id: "NextFTC",
  label: "NextFTC",
  description: "Command-based sequence for NextFTC.",
  experimental: true,
  trackerTelemetry: "null",
  java: {
    imports,
    commands: {
      // Delay takes seconds.
      wait: (ms) => `new Delay(${(ms / 1000).toFixed(3)})`,
      waitUntil: (condition) => `new WaitUntil(() -> ${condition})`,
      instant: (body) => `new InstantCommand(() -> ${body})`,
      sequential: (inner) => `new SequentialGroup(${inner})`,
      race: (inner) => `new ParallelRaceGroup(${inner})`,
      perpetual: (body) =>
        `new LambdaCommand("Update").setUpdate(() -> ${body}).setIsDone(() -> false)`,
      // NextFTC's own Pedro extension still targets Pedro 2 (PathChain), so
      // the follow command is built here rather than imported.
      followPath: (path) =>
        `new LambdaCommand("FollowPath").setStart(() -> follower.follow(${path})).setIsDone(() -> !follower.isBusy())`,
    },

    classTemplate: (p) => `
${fileHeader(p)}
${markerImports(p)}${p.ppReaderImport}
import java.io.IOException;

public class ${p.className} extends Command {

${fields(p, "\n    private Command group;")}

    public ${p.className}(final Follower follower, HardwareMap hw) throws IOException {
${constructorSetup(p)}
    }

${buildPathsMethod(p)}

    @Override
    public void start() {
        buildPaths();
        group = new SequentialGroup(
${p.commands}
        );
        group.start();
    }

    @Override
    public void update() {
        if (group != null) group.update();
    }

    @Override
    public void stop(boolean interrupted) {
        if (group != null) group.stop(interrupted);
    }

    @Override
    public boolean isDone() {
        return group != null && group.isDone();
    }

${helperMethods(p)}
}
`,
  },

  kotlin: {
    imports: kt.kotlinImports(imports),
    commands: {
      wait: (ms) => `Delay(${(ms / 1000).toFixed(3)})`,
      waitUntil: (condition) => `WaitUntil { ${condition} }`,
      instant: (body) => `InstantCommand ${kt.kotlinLambda(body)}`,
      sequential: (inner) => `SequentialGroup(${inner})`,
      race: (inner) => `ParallelRaceGroup(${inner})`,
      perpetual: (body) =>
        `LambdaCommand("Update").setUpdate ${kt.kotlinLambda(body)}.setIsDone { false }`,
      followPath: (path) =>
        `LambdaCommand("FollowPath").setStart { follower.follow(${path}) }.setIsDone { !follower.isBusy() }`,
    },

    classTemplate: (p) => `
${kt.fileHeader(p)}
${markerImports(p)}${p.ppReaderImport}

class ${p.className}(
    private val follower: Follower,
    hw: HardwareMap,
) : Command() {

${kt.fields(p, "\n    private var group: Command? = null")}

    init {
${kt.constructorSetup(p)}
    }

${kt.buildPathsMethod(p)}

    override fun start() {
        buildPaths()
        val sequence = SequentialGroup(
${p.commands}
        )
        group = sequence
        sequence.start()
    }

    override fun update() {
        group?.update()
    }

    override fun stop(interrupted: Boolean) {
        group?.stop(interrupted)
    }

    override val isDone: Boolean get() = group?.isDone ?: false

${helperMethods(p)}
}
`,
  },
};
