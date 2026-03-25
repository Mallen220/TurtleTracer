// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("javaImporter variable reuse", () => {
  it("reuses variable reference points without dropping original references", () => {
    const javaCode = `
      package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

      import com.pedropathing.follower.Follower;
      import com.pedropathing.geometry.BezierCurve;
      import com.pedropathing.geometry.BezierLine;
      import com.pedropathing.geometry.Pose;
      import com.pedropathing.paths.PathChain;

      public class nextFTC extends SequentialCommandGroup {
        private Pose startPoint;
        private Pose Name;
        private Pose AnotherName;

        private PathChain startPointTOName;
        private PathChain NameTOAnotherName;

        public void buildPaths() {
          startPoint = new Pose(56.000, 8.000, Math.toRadians(90));
          Name = new Pose(56.000, 36.000, Math.toRadians(180));
          AnotherName = new Pose(37.000, 38.000, Math.toRadians(23));

          startPointTOName = follower
            .pathBuilder()
            .addPath(new BezierLine(startPoint, Name))
            .setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180))
            .build();

          NameTOAnotherName = follower
            .pathBuilder()
            .addPath(new BezierLine(Name, AnotherName))
            .setLinearHeadingInterpolation(Math.toRadians(5), Math.toRadians(23))
            .setReversed()
            .build();
        }
      }
    `;

    const data = importJavaProject(javaCode);
    expect(data.lines.length).toBe(2);
    // They share 'Name'
    expect(data.lines[0].endPoint.x).toBe(data.lines[1].startPoint!.x);
    expect(data.lines[0].endPoint.y).toBe(data.lines[1].startPoint!.y);
  });
});
