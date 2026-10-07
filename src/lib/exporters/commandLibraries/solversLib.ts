// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibrary } from "./types";
import { PEDRO_IMPORTS } from "./pedroImports";

export const solversLib: CommandLibrary = {
  id: "SolversLib",
  label: "SolversLib",
  description: "Command-based sequence for SolversLib.",
  trackerTelemetry: "telemetry",
  imports: `
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.ParallelRaceGroup;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.command.WaitUntilCommand;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.command.RunCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;
`,
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
${p.warning}

package ${p.packageName};

${PEDRO_IMPORTS}
${p.imports}
import org.firstinspires.ftc.robotcore.external.Telemetry;
${p.ppReaderImport}
${p.hasEventMarkers ? "import com.turtletracerlib.pathing.ProgressTracker;\n" : ""}import com.turtletracerlib.pathing.NamedCommands;
import java.io.IOException;

public class ${p.className} extends SequentialCommandGroup {

    private final Follower follower;
    private final PoseFactory p = PoseFactory.degrees();${p.trackerField}

    // Poses
${p.poseDeclarations}

    // Path chains
${p.pathChainDeclarations}

    public ${p.className}(final Follower follower, HardwareMap hw, Telemetry telemetry) throws IOException {
        this.follower = follower;

        ${p.ppReaderInit}${p.eventBindingCode}

        // Load poses
${p.poseInitializations}

        follower.setPose(startPoint);

        buildPaths();

        addCommands(
${p.commands}
        );
    }

    public void buildPaths() {
        ${p.pathBuilders}
    }

    ${p.ftcPoseHelper}
    ${p.metricHelper}
}
`,
};
