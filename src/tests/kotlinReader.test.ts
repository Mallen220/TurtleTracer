// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { readPedroJava } from "../utils/javaImporter/pedroReader";
import type { SequenceItem } from "../types";

const read = (source: string) => readPedroJava(source, { language: "kotlin" });

/** The sequence as short text, e.g. ["path", "wait 500"]. */
const steps = (sequence: SequenceItem[]) =>
  sequence.map((s) =>
    s.kind === "wait"
      ? `wait ${s.durationMs}`
      : s.kind === "rotate"
        ? `turn ${(s as { degrees: number }).degrees}`
        : s.kind,
  );

describe("reading Kotlin people write", () => {
  it("reads vals with types, lazy paths, constructors and Kotlin durations", () => {
    const { project, notes } = read(`
package org.firstinspires.ftc.teamcode.auto

import kotlin.math.PI
import kotlin.time.Duration.Companion.seconds

/* A comment /* with a nested one */ and line(fake, path) in it */
@Autonomous(name = "Red Close", group = "Red")
class RedClose : NextFTCOpMode() {
    private val p = PoseFactory.degrees()
    private val start: Pose = p.of(9.0, 60.0, 0.0)
    private val score = p.of(40.0, 60.0, 90.0)
    private val park: Pose = Pose(60.0, 30.0, PI / 2)

    private val toScore: Path by lazy {
        val unused = 3.0
        line(start, score)
            .linear(Math.toRadians(0.0), Math.toRadians(90.0))
    }
    private val toPark by lazy { curve(score, p.of(50.0, 60.0, 0.0), park).tangent() }

    private val help = """
        line(not, code)
    """

    override fun onStartButtonPressed() {
        follower.setStartingPose(start)
        SequentialGroup(
            InstantCommand { follower.follow(toScore) },
            WaitUntil { !follower.isBusy },
            Delay(0.5.seconds),
            LambdaCommand("park").setStart { follower.follow(toPark) },
            Delay(250.milliseconds),
        )()
    }
}
`);
    expect(notes).toEqual([]);
    expect(project.startPoint).toMatchObject({ x: 9, y: 60, degrees: 0 });
    expect(project.lines).toHaveLength(2);
    expect(project.lines[0]).toMatchObject({
      name: "score",
      endPoint: { x: 40, y: 60, heading: "linear", startDeg: 0, endDeg: 90 },
    });
    expect(project.lines[1]).toMatchObject({
      name: "park",
      endPoint: { x: 60, y: 30, heading: "tangential" },
      controlPoints: [{ x: 50, y: 60 }],
    });
    expect(steps(project.sequence)).toEqual([
      "path",
      "wait 500",
      "path",
      "wait 250",
    ]);
  });

  it("reads SolversLib and Ivy commands built without new", () => {
    const solvers = read(`
class Auto(private val follower: Follower) : SequentialCommandGroup() {
    private val a = Pose(10.0, 20.0, 0.0)
    private val b = Pose(30.0, 20.0, 0.0)
    private lateinit var first: Path

    init {
        first = line(a, b).tangent()
        follower.setPose(a)
        addCommands(
            FollowPathCommand(follower, first),
            WaitCommand(300),
            InstantCommand({
                follower.hold(follower.pose().withHeading(Math.toRadians(90.0)))
            }),
        )
    }
}`);
    expect(solvers.notes).toEqual([]);
    expect(solvers.project.lines).toHaveLength(1);
    expect(steps(solvers.project.sequence)).toEqual([
      "path",
      "wait 300",
      "turn 90",
    ]);

    const ivy = read(`
val p = PoseFactory.degrees()
val go = line(p.of(0.0, 0.0, 0.0), p.of(24.0, 0.0, 0.0))
fun command(): Command = Groups.sequential(
    PedroCommands.follow(follower, go),
    Commands.waitMs(750.0),
)`);
    expect(ivy.notes).toEqual([]);
    expect(steps(ivy.project.sequence)).toEqual(["path", "wait 750"]);
  });

  it("reads path builders, elvis defaults, conversions and casts", () => {
    const { project, notes } = read(`
val saved: Pose? = null
val start = saved ?: Pose(72.toDouble(), 10.0, 0.0)
val end = Pose(72.0, 50.0 as Double, 0.0)
val chain = follower!!.pathBuilder()
    .addPath(BezierLine(start, end))
    .setLinearHeadingInterpolation(0.0, PI)
    .build()
follower.followPath(chain)
`);
    expect(notes).toEqual([]);
    expect(project.startPoint).toMatchObject({ x: 72, y: 10 });
    expect(project.lines[0]!.endPoint).toMatchObject({
      x: 72,
      y: 50,
      heading: "linear",
      startDeg: 0,
      endDeg: 180,
    });
  });

  it("ends an expression at a line break the way Kotlin does", () => {
    // The bracketed line is a statement of its own, not a call on the
    // pose, and the minus starts a new statement rather than subtracting.
    const { project, notes } = read(`
val a = p.of(10.0, 20.0, 0.0)
(follower as Follower).follow(first)
val x = 30.0
-x
val b = p.of(x, 20.0, 0.0)
val p = PoseFactory.degrees()
val first = line(a, b)
`);
    expect(notes).toEqual([]);
    expect(project.lines[0]!.endPoint).toMatchObject({ x: 30, y: 20 });
  });

  it("doesn't take named arguments or function return types for variables", () => {
    const { project, notes } = read(`
val score = Pose(40.0, 60.0, 0.0)
fun target(): Pose = Pose(1.0, 1.0, 0.0)
fun make(score: Pose = Pose(0.0, 0.0, 0.0)) = score
val toScore = line(Pose(x = 9.0, y = 60.0), score)
`);
    expect(notes).toEqual([]);
    expect(project.lines[0]).toMatchObject({
      startPoint: { x: 9, y: 60 },
      endPoint: { x: 40, y: 60 },
    });
  });
});
