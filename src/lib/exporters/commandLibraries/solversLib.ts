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
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.command.RunCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
`;

const markerImports = (p: { hasEventMarkers: boolean }) =>
  p.hasEventMarkers
    ? "import com.turtletracerlib.pathing.ProgressTracker;\n"
    : "";

export const solversLib: CommandLibrary = {
  id: "SolversLib",
  label: "SolversLib",
  description: "Command-based sequence for SolversLib.",
  trackerTelemetry: "telemetry",
  java: {
    imports,
    commands: {
      wait: (ms) => `new WaitCommand(${ms.toFixed(0)})`,
      waitUntil: (condition) => `new WaitUntilCommand(() -> ${condition})`,
      instant: (body) => `new InstantCommand(() -> ${body})`,
      sequential: (inner) => `new SequentialCommandGroup(${inner})`,
      race: (inner) => `new ParallelRaceGroup(${inner})`,
      perpetual: (body) => `new RunCommand(() -> ${body})`,
      followPath: (path) => `new FollowPathCommand(follower, ${path})`,
    },

    classTemplate: (p) => `
${fileHeader(p)}
import org.firstinspires.ftc.robotcore.external.Telemetry;
${p.ppReaderImport}
${markerImports(p)}import com.turtletracerlib.pathing.NamedCommands;
import java.io.IOException;

public class ${p.className} extends SequentialCommandGroup {

${fields(p)}

    public ${p.className}(final Follower follower, HardwareMap hw, Telemetry telemetry) throws IOException {
${constructorSetup(p)}

        buildPaths();

        addCommands(
${p.commands}
        );
    }

${buildPathsMethod(p)}

${helperMethods(p)}
}
`,
  },

  kotlin: {
    imports: kt.kotlinImports(imports),
    commands: {
      wait: (ms) => `WaitCommand(${ms.toFixed(0)})`,
      waitUntil: (condition) => `WaitUntilCommand { ${condition} }`,
      // A Java vararg of requirements follows the Runnable, so the lambda
      // has to go inside the brackets.
      instant: (body) => `InstantCommand(${kt.kotlinLambda(body)})`,
      sequential: (inner) => `SequentialCommandGroup(${inner})`,
      race: (inner) => `ParallelRaceGroup(${inner})`,
      perpetual: (body) => `RunCommand(${kt.kotlinLambda(body)})`,
      followPath: (path) => `FollowPathCommand(follower, ${path})`,
    },

    classTemplate: (p) => `
${kt.fileHeader(p)}
import org.firstinspires.ftc.robotcore.external.Telemetry
${p.ppReaderImport}
${markerImports(p)}import com.turtletracerlib.pathing.NamedCommands

class ${p.className}(
    private val follower: Follower,
    hw: HardwareMap,
    telemetry: Telemetry,
) : SequentialCommandGroup() {

${kt.fields(p)}

    init {
${kt.constructorSetup(p)}

        buildPaths()

        addCommands(
${p.commands}
        )
    }

${kt.buildPathsMethod(p)}

${helperMethods(p)}
}
`,
  },
};
