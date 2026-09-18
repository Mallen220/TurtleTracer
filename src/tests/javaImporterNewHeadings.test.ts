// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("Heading Extractor - New Formats", () => {
  it("extracts all HeadingInterpolator variations", () => {
    const javaCode = `
      public void buildPaths() {
        a = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(56, 8), new Pose(56, 36)))
          .setLinearHeadingInterpolation(Math.toRadians(10), Math.toRadians(20))
          .build();

        b = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(56, 36), new Pose(73, 55)))
          .setHeadingInterpolation(
            HeadingInterpolator.linear(Math.toRadians(30), Math.toRadians(40))
          )
          .setReversed()
          .build();

        c = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(73, 55), new Pose(107, 103)))
          .setConstantHeadingInterpolation(Math.toRadians(50))
          .build();

        d = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(107, 103), new Pose(95, 46)))
          .setHeadingInterpolation(HeadingInterpolator.constant(Math.toRadians(60)))
          .setReversed()
          .build();

        e = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(95, 46), new Pose(89, 76)))
          .setTangentHeadingInterpolation()
          .build();

        f = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(89, 76), new Pose(66, 55)))
          .setHeadingInterpolation(HeadingInterpolator.tangent)
          .setReversed()
          .build();

        g = follower
          .pathBuilder()
          .addPath(new BezierLine(new Pose(66, 55), new Pose(47, 66)))
          .setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(70.000, 80.000)))
          .build();
      }
    `;

    const data = importJavaProject(javaCode);
    expect(data.lines.length).toBe(7);

    expect(data.lines[0].endPoint.heading).toBe("linear");
    expect((data.lines[0].endPoint as any).startDeg).toBe(10);
    expect((data.lines[0].endPoint as any).endDeg).toBe(20);

    expect(data.lines[1].endPoint.heading).toBe("linear");
    expect((data.lines[1].endPoint as any).startDeg).toBe(30);
    expect((data.lines[1].endPoint as any).endDeg).toBe(40);
    expect((data.lines[1].endPoint as any).reverse).toBe(true);

    expect(data.lines[2].endPoint.heading).toBe("constant");
    expect((data.lines[2].endPoint as any).degrees).toBe(50);

    expect(data.lines[3].endPoint.heading).toBe("constant");
    expect((data.lines[3].endPoint as any).degrees).toBe(60);

    expect(data.lines[4].endPoint.heading).toBe("tangential");

    expect(data.lines[5].endPoint.heading).toBe("tangential");
    expect((data.lines[5].endPoint as any).reverse).toBe(true);

    expect(data.lines[6].endPoint.heading).toBe("facingPoint");
    expect((data.lines[6].endPoint as any).targetX).toBe(70);
    expect((data.lines[6].endPoint as any).targetY).toBe(80);
  });

  it("treats bare heading numbers as radians", () => {
    const data = importJavaProject(`
      class A { void b() {
        p = follower.pathBuilder()
          .addPath(new BezierLine(new Pose(1, 2), new Pose(3, 4)))
          .setLinearHeadingInterpolation(${Math.PI / 2}, ${-Math.PI})
          .build();
      } }
    `);
    const end = data.lines[0].endPoint as any;
    expect(end.startDeg).toBeCloseTo(90);
    expect(end.endDeg).toBeCloseTo(-180);
  });

  it("resolves pose.getHeading() references", () => {
    const data = importJavaProject(`
      class A {
        private final Pose startPose = new Pose(9, 60, Math.toRadians(30));
        private final Pose endPose = new Pose(37, 50, Math.toRadians(120));
        void b() {
          p = follower.pathBuilder()
            .addPath(new BezierLine(startPose, endPose))
            .setConstantHeadingInterpolation(endPose.getHeading())
            .build();
        }
      }
    `);
    expect((data.lines[0].endPoint as any).degrees).toBe(120);
  });

  it("reads turnTo(Math.toRadians(x)) as x degrees", () => {
    const data = importJavaProject(`
      class A { Command c() {
        return new SequentialGroup(
          new InstantCommand(() -> follower.turnTo(Math.toRadians(-45)))
        );
      } }
    `);
    const rotates = data.sequence.filter((s) => s.kind === "rotate");
    expect(rotates).toHaveLength(1);
    expect((rotates[0] as any).degrees).toBe(-45);
  });
});
