// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("javaImporter sequential commands", () => {
  it("extracts wait and custom actions", () => {
    const javaCode = `
      package org.firstinspires.ftc.teamcode.Commands.AutoCommands;
      import com.pedropathing.follower.Follower;
      import com.pedropathing.geometry.Pose;

      public class AutonomousProgram extends PedroOpMode {
          private final Pose startPose = new Pose(9.0, 60.0, Math.toRadians(0.0));
          private final Pose finishPose = new Pose(37.0, 50.0, Math.toRadians(180.0));

          private PathChain move;

          public void buildPaths() {
              move = follower.pathBuilder()
                      .addPath(new BezierLine(new Point(startPose), new Point(finishPose)))
                      .setLinearHeadingInterpolation(startPose.getHeading(), finishPose.getHeading())
                      .build();
          }

          public Command secondRoutine() {
              return new SequentialGroup(
                  new ParallelGroup(
                      new FollowPath(move),
                      Lift.INSTANCE.toHigh()
                  ),
                  new WaitCommand(1500),
                  new InstantCommand(() -> follower.turnTo(0.401)),
                  new WaitUntilCommand(() -> !follower.isTurning())
              );
          }
      }
    `;

    const data = importJavaProject(javaCode);
    expect(data.sequence.length).toBe(3); // path, wait, rotate
    expect(data.sequence[0].kind).toBe("path");
    expect(data.sequence[1].kind).toBe("wait");
    expect((data.sequence[1] as any).durationMs).toBe(1500);
    expect(data.sequence[2].kind).toBe("rotate");
    // 0.401 rad in degrees is around ~22.9
    expect(Math.round((data.sequence[2] as any).degrees)).toBe(23);
  });
});
