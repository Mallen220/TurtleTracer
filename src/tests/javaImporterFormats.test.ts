// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { importJavaProject } from "../utils/javaImporter";

describe("Java Importer Format Compatibility", () => {
  it("parses Format 1 correctly (SequentialCommandGroup + InstantCommand)", () => {
    const code1 = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import com.seattlesolvers.solverslib.command.InstantCommand;
import com.seattlesolvers.solverslib.command.SequentialCommandGroup;
import com.seattlesolvers.solverslib.command.WaitCommand;
import com.seattlesolvers.solverslib.pedroCommand.FollowPathCommand;

public class Everythingtest extends SequentialCommandGroup {
  private final Follower follower;

  // Poses
  private Pose startPoint;
  private Pose a;
  private Pose b;
  private Pose c;
  private Pose d;
  private Pose e;
  private Pose f;
  private Pose g;
  private Pose h;

  // Path chains
  private PathChain startPointTOa;
  private PathChain aTOb;
  private PathChain bTOc;
  private PathChain cTOd;
  private PathChain dTOe;
  private PathChain eTOf;
  private PathChain fTOg;
  private PathChain gTOh;

  public Everythingtest() {
    startPoint = new Pose(56.000, 8.000, Math.toRadians(90));
    a = new Pose(56.000, 36.000, Math.toRadians(180));
    b = new Pose(73.000, 55.000, Math.toRadians(0));
    c = new Pose(107.000, 103.000, Math.toRadians(0));
    d = new Pose(95.000, 46.000, Math.toRadians(0));
    e = new Pose(89.000, 76.000, Math.toRadians(0));
    f = new Pose(66.000, 55.000, Math.toRadians(0));
    g = new Pose(47.000, 66.000, Math.toRadians(0));
    h = new Pose(104.000, 90.000, Math.toRadians(0));

    follower.setStartingPose(startPoint);

    buildPaths();

    addCommands(
      new FollowPathCommand(follower, startPointTOa),
      new FollowPathCommand(follower, aTOb),
      new FollowPathCommand(follower, bTOc),
      new FollowPathCommand(follower, cTOd),
      new FollowPathCommand(follower, dTOe),
      new FollowPathCommand(follower, eTOf),
      new FollowPathCommand(follower, fTOg),
      new FollowPathCommand(follower, gTOh),
      new WaitCommand(1000),
      new InstantCommand(() -> follower.turnTo(0.000))
    );
  }

  public void buildPaths() {
    startPointTOa = follower.pathBuilder().addPath(new BezierLine(startPoint, a)).setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180)).build();
    aTOb = follower.pathBuilder().addPath(new BezierLine(a, b)).setLinearHeadingInterpolation(Math.toRadians(0), Math.toRadians(0)).setReversed().build();
    bTOc = follower.pathBuilder().addPath(new BezierLine(b, c)).setConstantHeadingInterpolation(Math.toRadians(0)).build();
    cTOd = follower.pathBuilder().addPath(new BezierLine(c, d)).setConstantHeadingInterpolation(Math.toRadians(0)).setReversed().build();
    dTOe = follower.pathBuilder().addPath(new BezierLine(d, e)).setTangentHeadingInterpolation().build();
    eTOf = follower.pathBuilder().addPath(new BezierLine(e, f)).setTangentHeadingInterpolation().setReversed().build();
    fTOg = follower.pathBuilder().addPath(new BezierLine(f, g)).setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(71.537, 110.140))).build();
    gTOh = follower.pathBuilder().addPath(new BezierLine(g, h)).setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(72.693, 35.939))).setReversed().build();
  }
}
    `;
    const data = importJavaProject(code1);

    expect(data.startPoint.degrees).toBe(90);
    expect(data.lines.length).toBe(8);
    expect(data.sequence.length).toBe(10);
    expect(data.lines[0].name).toBe("a");
    expect(data.lines[0].endPoint.heading).toBe("linear");
    expect((data.lines[0].endPoint as any).startDeg).toBe(90);
    expect((data.lines[0].endPoint as any).endDeg).toBe(180);
    expect((data.lines[0].endPoint as any).reverse).toBe(false);

    expect(data.lines[1].name).toBe("b");
    expect((data.lines[1].endPoint as any).reverse).toBe(true);

    expect(data.lines[2].name).toBe("c");
    expect(data.lines[2].endPoint.heading).toBe("constant");
    expect((data.lines[2].endPoint as any).degrees).toBe(0);

    expect(data.lines[4].name).toBe("e");
    expect(data.lines[4].endPoint.heading).toBe("tangential");

    expect(data.lines[6].name).toBe("g");
    expect(data.lines[6].endPoint.heading).toBe("facingPoint");
    expect(Math.round((data.lines[6].endPoint as any).targetX)).toBe(72);

    expect((data.sequence[8] as any).durationMs).toBe(1000);
    expect((data.sequence[9] as any).degrees).toBe(0);
  });

  it("parses Format 2 correctly (OpMode switch/case with paths class)", () => {
    const code2 = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.HeadingInterpolator;
import com.pedropathing.paths.PathChain;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.util.ElapsedTime;

public class TurtleTracerAutonomous extends OpMode {

  public Follower follower;
  private ElapsedTime pathTimer;
  private Paths paths;

  @Override
  public void init() {
    follower.setStartingPose(new Pose(56.000, 8.000, Math.toRadians(90.000)));
    pathTimer = new ElapsedTime();
    paths = new Paths(follower);
  }

  public static class Paths {
    public PathChain a;
    public PathChain b;
    public PathChain c;
    public PathChain d;
    public PathChain e;
    public PathChain f;
    public PathChain g;
    public PathChain h;

    public Paths(Follower follower) {
      a = follower.pathBuilder().addPath(new BezierLine(new Pose(56.000, 8.000), new Pose(56.000, 36.000))).setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180)).build();
      b = follower.pathBuilder().addPath(new BezierLine(new Pose(56.000, 36.000), new Pose(73.000, 55.000))).setHeadingInterpolation(HeadingInterpolator.linear(Math.toRadians(0), Math.toRadians(0))).setReversed().build();
      c = follower.pathBuilder().addPath(new BezierLine(new Pose(73.000, 55.000), new Pose(107.000, 103.000))).setConstantHeadingInterpolation(Math.toRadians(0)).build();
      d = follower.pathBuilder().addPath(new BezierLine(new Pose(107.000, 103.000), new Pose(95.000, 46.000))).setHeadingInterpolation(HeadingInterpolator.constant(Math.toRadians(0))).setReversed().build();
      e = follower.pathBuilder().addPath(new BezierLine(new Pose(95.000, 46.000), new Pose(89.000, 76.000))).setTangentHeadingInterpolation().build();
      f = follower.pathBuilder().addPath(new BezierLine(new Pose(89.000, 76.000), new Pose(66.000, 55.000))).setHeadingInterpolation(HeadingInterpolator.tangent).setReversed().build();
      g = follower.pathBuilder().addPath(new BezierLine(new Pose(66.000, 55.000), new Pose(47.000, 66.000))).setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(71.537, 110.140))).build();
      h = follower.pathBuilder().addPath(new BezierLine(new Pose(47.000, 66.000), new Pose(104.000, 90.000))).setHeadingInterpolation(HeadingInterpolator.facingPoint(new Pose(72.693, 35.939))).setReversed().build();
    }
  }
}
    `;

    const data = importJavaProject(code2);
    expect(data.startPoint.degrees).toBe(90);
    expect(data.lines.length).toBe(8);

    // OpMode export does not generate actions in our standard Sequence array output for Wait/Turn
    // due to lack of a unified block in the actual Java export. The visualizer relies on paths.
    // Testing purely paths for this case.

    expect(data.lines[1].name).toBe("b");
    expect(data.lines[1].endPoint.heading).toBe("linear");
    expect((data.lines[1].endPoint as any).startDeg).toBe(0);
    expect((data.lines[1].endPoint as any).endDeg).toBe(0);
    expect((data.lines[1].endPoint as any).reverse).toBe(true);

    expect(data.lines[3].name).toBe("d");
    expect(data.lines[3].endPoint.heading).toBe("constant");
    expect((data.lines[3].endPoint as any).degrees).toBe(0);
    expect((data.lines[3].endPoint as any).reverse).toBe(true);

    expect(data.lines[5].name).toBe("f");
    expect(data.lines[5].endPoint.heading).toBe("tangential");
    expect((data.lines[5].endPoint as any).reverse).toBe(true);

    expect(data.lines[7].name).toBe("h");
    expect(data.lines[7].endPoint.heading).toBe("facingPoint");
    expect(Math.round((data.lines[7].endPoint as any).targetX)).toBe(73); // It evaluates to 72.693 due to the code. Math.round(72.693) == 73
    expect(Math.round((data.lines[7].endPoint as any).targetY)).toBe(36); // Math.round(35.939) == 36
    expect((data.lines[7].endPoint as any).reverse).toBe(true);
  });

  it("parses Format 3 correctly (Command framework + Group)", () => {
    const code3 = `
package org.firstinspires.ftc.teamcode.Commands.AutoCommands;

import com.pedropathing.follower.Follower;
import com.pedropathing.geometry.BezierCurve;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.PathChain;
import dev.nextftc.core.commands.Command;
import dev.nextftc.core.commands.delays.Delay;
import dev.nextftc.core.commands.delays.WaitUntil;
import dev.nextftc.core.commands.groups.ParallelRaceGroup;
import dev.nextftc.core.commands.groups.SequentialGroup;
import dev.nextftc.core.commands.utility.InstantCommand;

public class reference extends Command {
  private final Follower follower;
  private Command group;

  private Pose startPoint;
  private Pose a;
  private Pose b;

  private PathChain startPointTOa;
  private PathChain aTOb;

  public reference() {
    startPoint = new Pose(56.000, 8.000, Math.toRadians(90));
    a = new Pose(56.000, 36.000, Math.toRadians(180));
    b = new Pose(73.000, 55.000, Math.toRadians(0));

    follower.setStartingPose(startPoint);
  }

  public void buildPaths() {
    startPointTOa = follower.pathBuilder().addPath(new BezierLine(startPoint, a)).setLinearHeadingInterpolation(Math.toRadians(90), Math.toRadians(180)).build();
    aTOb = follower.pathBuilder().addPath(new BezierLine(a, b)).setLinearHeadingInterpolation(Math.toRadians(0), Math.toRadians(0)).setReversed().build();
  }

  @Override
  public void start() {
    buildPaths();
    group = new SequentialGroup(
      new FollowPath(startPointTOa),
      new FollowPath(aTOb),
      new Delay(0.110),
      new InstantCommand(() -> follower.turnTo(2.094)),
      new WaitUntil(() -> !follower.isTurning())
    );
    group.start();
  }
}
    `;

    const data = importJavaProject(code3);

    expect(data.startPoint.degrees).toBe(90);
    expect(data.lines.length).toBe(2);

    expect(data.lines[0].name).toBe("a");
    expect(data.lines[0].endPoint.heading).toBe("linear");

    expect(data.lines[1].name).toBe("b");
    expect((data.lines[1].endPoint as any).reverse).toBe(true);

    expect((data.sequence[2] as any).durationMs).toBe(110);
    expect((data.sequence[3] as any).degrees).toBe(120);
  });
});
