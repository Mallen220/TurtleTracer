// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { CommandLibrary } from "./types";
import { PEDRO_IMPORTS } from "./pedroImports";

export const nextFtc: CommandLibrary = {
  id: "NextFTC",
  label: "NextFTC",
  description: "Command-based sequence for NextFTC.",
  experimental: true,
  trackerTelemetry: "null",
  imports: `
import dev.nextftc.core.commands.Command;
import dev.nextftc.core.commands.groups.SequentialGroup;
import dev.nextftc.core.commands.groups.ParallelRaceGroup;
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.delays.WaitUntil;
import dev.nextftc.core.commands.utility.InstantCommand;
import dev.nextftc.core.commands.utility.LambdaCommand;
`,
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
${p.warning}

package ${p.packageName};

${PEDRO_IMPORTS}
${p.imports}
${p.hasEventMarkers ? "import com.turtletracerlib.pathing.ProgressTracker;\nimport com.turtletracerlib.pathing.NamedCommands;\n" : ""}${p.ppReaderImport}
import java.io.IOException;

public class ${p.className} extends Command {

    private final Follower follower;
    private final PoseFactory p = PoseFactory.degrees();${p.trackerField}
    private Command group;

    // Poses
${p.poseDeclarations}

    // Path chains
${p.pathChainDeclarations}

    public ${p.className}(final Follower follower, HardwareMap hw) throws IOException {
        this.follower = follower;

        ${p.ppReaderInit}${p.eventBindingCode}

        // Load poses
${p.poseInitializations}

        follower.setPose(startPoint);
    }

    public void buildPaths() {
        ${p.pathBuilders}
    }

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

    ${p.ftcPoseHelper}
    ${p.metricHelper}
}
`,
};
