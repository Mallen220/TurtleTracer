// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeAll } from "vitest";

// Skip prettier: the tests check the generated text, not its layout.
vi.mock("prettier", () => ({
  default: { format: vi.fn(async (code: string) => code) },
}));
vi.mock("prettier-plugin-java", () => ({ default: {} }));

import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { CommandLibraryId, Line, Point, SequenceItem } from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 0 };

const line = (
  id: string,
  name: string,
  endPoint: Partial<Point>,
  over: Partial<Line> = {},
): Line => ({
  id,
  name,
  endPoint: { heading: "tangential", reverse: false, ...endPoint } as Point,
  controlPoints: [],
  color: "red",
  ...over,
});

type Options = {
  fileName?: string | null;
  sequence?: SequenceItem[];
  library?: CommandLibraryId;
  hardcode?: boolean;
  system?: "Pedro" | "FTC";
  units?: "imperial" | "metric";
  startPoint?: Point;
};

const generate = (lines: Line[], o: Options = {}) =>
  generateSequentialCommandCode(
    o.startPoint ?? start,
    lines,
    o.fileName === undefined ? "Auto.turt" : o.fileName,
    o.sequence,
    o.library ?? "SolversLib",
    "org.team.Commands",
    o.hardcode ?? false,
    o.system ?? "Pedro",
    o.units ?? "imperial",
  );

const squash = (code: string) => code.replaceAll(/\s+/g, " ");

const scoreAndPark = () => [
  line("a", "Score", { x: 20, y: 20, heading: "constant", degrees: 90 }),
  line("b", "Park", {
    x: 40,
    y: 20,
    heading: "linear",
    startDeg: 90,
    endDeg: 180,
  }),
];

describe("generateSequentialCommandCode", () => {
  describe("class and file names", () => {
    it("names the class after the file with unsafe characters replaced", async () => {
      const code = await generate(scoreAndPark(), {
        fileName: String.raw`C:\My Paths\Red Side-1.turt`,
      });
      expect(code).toContain(
        "public class Red_Side_1 extends SequentialCommandGroup",
      );
      expect(code).toContain("public Red_Side_1(");
    });

    it("falls back to AutoPath without a usable name", async () => {
      for (const fileName of [null, "", "/a/b/.turt"]) {
        const code = await generate(scoreAndPark(), { fileName });
        expect(code).toContain("public class AutoPath ");
      }
    });

    it("reads the project back by its real file name at runtime", async () => {
      const code = await generate(scoreAndPark(), {
        fileName: String.raw`C:\My Paths\Red Side-1.turt`,
      });
      expect(code).toContain(
        'new TurtleTracerReader("Red Side-1.turt", hw.appContext)',
      );
    });

    it("uses the package name it is given", async () => {
      expect(await generate(scoreAndPark())).toContain(
        "package org.team.Commands;",
      );
    });
  });

  describe("poses", () => {
    it("loads poses at runtime unless values are hardcoded", async () => {
      const code = await generate(scoreAndPark());
      expect(code).toContain('startPoint = pp.get("startPoint");');
      expect(code).toContain('Score = pp.get("Score");');
      expect(code).toContain("import com.turtletracerlib.TurtleTracerReader;");
    });

    it("writes the numbers into the code when hardcoded", async () => {
      const code = await generate(scoreAndPark(), { hardcode: true });
      expect(code).toContain("Score = p.of(20.000, 20.000, 90);");
      expect(code).toContain("Park = p.of(40.000, 20.000, 180);");
      expect(code).not.toContain("TurtleTracerReader");
      expect(code).not.toContain("pp.get(");
    });

    it("starts facing the way the first path begins", async () => {
      const code = await generate(scoreAndPark(), { hardcode: true });
      // The start point says 0 degrees, but the first path is held at 90.
      expect(code).toContain("startPoint = p.of(10.000, 10.000, 90);");
    });

    it("declares a pose name only once when lines share it", async () => {
      const lines = [
        line("a", "Shoot", { x: 20, y: 20 }),
        line("b", "Intake", { x: 40, y: 20 }),
        line("c", "Shoot", { x: 20, y: 20 }),
      ];
      const code = await generate(lines, { hardcode: true });
      expect(code.match(/private Pose Shoot;/g)).toHaveLength(1);
      expect(code).toContain("ShootTOIntake");
      expect(code).toContain("IntakeTOShoot");
    });

    it("names unnamed lines by their position", async () => {
      const lines = [line("a", "", { x: 20, y: 20 })];
      expect(await generate(lines, { hardcode: true })).toContain(
        "private Pose point1;",
      );
    });

    it("shows metric lengths in centimetres", async () => {
      const code = await generate(scoreAndPark(), {
        hardcode: true,
        units: "metric",
      });
      expect(code).toContain("cmToInches(");
      expect(code).toContain("cmToInches(50.800)"); // 20 inches
    });

    it("writes poses the FTC way when that coordinate system is chosen", async () => {
      const pedro = await generate(scoreAndPark(), {
        hardcode: true,
        system: "Pedro",
      });
      const ftc = await generate(scoreAndPark(), {
        hardcode: true,
        system: "FTC",
      });
      expect(ftc).not.toBe(pedro);
      expect(ftc).not.toContain("Score = p.of(20.000, 20.000, 90);");
    });
  });

  describe("paths", () => {
    it("builds a line, or a curve when there are control points", async () => {
      const lines = [
        line("a", "Out", { x: 40, y: 10 }),
        line(
          "b",
          "Back",
          { x: 10, y: 10 },
          { controlPoints: [{ x: 25, y: 30 } as Point] },
        ),
      ];
      const code = squash(await generate(lines, { hardcode: true }));
      expect(code).toContain("startPointTOOut = line(startPoint, Out)");
      expect(code).toContain(
        "OutTOBack = curve(Out, p.of(25.000, 30.000, 0.0), Back)",
      );
    });

    it("follows each unchained path in order", async () => {
      const lines = [
        line("a", "One", { x: 20, y: 10 }),
        line("b", "Two", { x: 30, y: 10 }),
      ];
      const code = await generate(lines, { hardcode: true });
      const follows = [
        ...code.matchAll(/new FollowPathCommand\(follower, (\w+)\)/g),
      ];
      expect(follows.map((m) => m[1])).toEqual(["startPointTOOne", "OneTOTwo"]);
    });

    it("joins chained lines into one path that is followed once", async () => {
      const lines = [
        line("a", "Score", { x: 20, y: 20, heading: "constant", degrees: 90 }),
        line(
          "b",
          "Park",
          { x: 40, y: 20, heading: "linear", startDeg: 90, endDeg: 180 },
          { isChain: true },
        ),
      ];
      const code = squash(await generate(lines, { hardcode: true }));
      expect(code).toContain(
        "startPointTOScore = path( line(startPoint, Score) .constant(Math.toRadians(90)), line(Score, Park) .linear(Math.toRadians(90), Math.toRadians(180)) );",
      );
      expect(code.match(/new FollowPathCommand/g)).toHaveLength(1);
      expect(code).not.toContain("private Path ScoreTOPark");
    });

    it("skips sequence steps that point at lines that don't exist", async () => {
      const code = await generate(scoreAndPark(), {
        hardcode: true,
        sequence: [
          { kind: "path", lineId: "ghost" },
          { kind: "path", lineId: "a" },
        ],
      });
      expect(code.match(/new FollowPathCommand/g)).toHaveLength(1);
      expect(code).toContain("startPointTOScore)");
    });

    it("runs macro steps inline, in place of the macro", async () => {
      const code = await generate(scoreAndPark(), {
        hardcode: true,
        sequence: [
          {
            kind: "macro",
            id: "m",
            name: "M",
            filePath: "/m.turt",
            sequence: [{ kind: "path", lineId: "a" }],
          } as SequenceItem,
          { kind: "path", lineId: "b" },
        ],
      });
      const follows = [
        ...code.matchAll(/FollowPathCommand\(follower, (\w+)\)/g),
      ].map((m) => m[1]);
      expect(follows).toEqual(["startPointTOScore", "ScoreTOPark"]);
    });
  });

  describe("headings", () => {
    it("uses the heading of the pose loaded at runtime when a constant heading isn't set", async () => {
      const lines = [
        line("a", "Score", {
          x: 20,
          y: 20,
          heading: "constant",
          degrees: undefined,
        }),
      ];
      const code = squash(await generate(lines));
      expect(code).toContain(".constant(Score.heading())");
    });

    it("uses the start and end poses' headings for a linear heading that isn't set", async () => {
      const lines = [line("a", "Score", { x: 20, y: 20, heading: "linear" })];
      const code = squash(await generate(lines));
      expect(code).toContain("startPoint.heading(), Score.heading()");
    });

    it("aims at a point for facingPoint", async () => {
      const lines = [
        line("a", "Score", {
          x: 20,
          y: 20,
          heading: "facingPoint",
          targetX: 70,
          targetY: 130,
        }),
      ];
      const code = squash(await generate(lines, { hardcode: true }));
      expect(code).toMatch(/\.facingPoint\(.*70.*130/);
    });

    it("applies a chain's global heading once, after the joined path", async () => {
      const lines = [
        line(
          "a",
          "One",
          { x: 20, y: 10 },
          { globalHeading: "constant", globalDegrees: 45 },
        ),
        line("b", "Two", { x: 30, y: 10 }, { isChain: true }),
      ];
      const code = squash(await generate(lines, { hardcode: true }));
      expect(code).toMatch(
        /line\(One, Two\) \) \.constant\(Math\.toRadians\(45\)\);/,
      );
      // Not repeated on the individual lines.
      expect(code.match(/Math\.toRadians\(45\)/g)).toHaveLength(1);
    });
  });

  describe("constructor", () => {
    // Pedro's quickstart has no Drivetrain subsystem, so the follower is passed in.
    it.each([
      [
        "SolversLib",
        "final Follower follower, HardwareMap hw, Telemetry telemetry",
      ],
      ["NextFTC", "final Follower follower, HardwareMap hw)"],
      ["Ivy", "final Follower follower, HardwareMap hw)"],
    ] as const)("%s takes the follower directly", async (library, params) => {
      const code = await generate(scoreAndPark(), { library, hardcode: true });
      expect(code).toContain(`Auto(${params}`);
      expect(code).toContain("this.follower = follower;");
      expect(code).not.toMatch(/Drivetrain|getFollower|Subsystems/);
    });
  });

  describe("libraries", () => {
    it("uses NextFTC's command names and follows paths with its own command, not a team class", async () => {
      const code = await generate(scoreAndPark(), {
        library: "NextFTC",
        hardcode: true,
      });
      expect(code).toContain(
        "import dev.nextftc.core.commands.groups.SequentialGroup;",
      );
      expect(code).toContain(
        'new LambdaCommand("FollowPath").setStart(() -> follower.follow(startPointTOScore)).setIsDone(() -> !follower.isBusy())',
      );
      expect(code).toContain(
        "import dev.nextftc.core.commands.utility.LambdaCommand;",
      );
      expect(code).not.toContain("teamcode.pedroPathing");
      expect(code).not.toContain("SequentialCommandGroup");
    });
  });

  describe("Ivy", () => {
    const rotate = (extra: object = {}): SequenceItem =>
      ({ kind: "rotate", id: "r", name: "", degrees: 90, ...extra }) as any;
    const wait = (extra: object = {}): SequenceItem =>
      ({ kind: "wait", id: "w", name: "", durationMs: 1500, ...extra }) as any;
    const path = (id: string): SequenceItem => ({ kind: "path", lineId: id });
    const marker = [
      { id: "e", name: "raiseArm", position: 0.5, parameters: [] },
    ];

    it("builds the sequence with Ivy's factories and a command() method", async () => {
      const code = squash(
        await generate(scoreAndPark(), { library: "Ivy", hardcode: true }),
      );
      expect(code).toContain("import com.pedropathing.ivy.groups.Groups;");
      expect(code).toContain(
        "import com.pedropathing.ivy.pedro.PedroCommands;",
      );
      expect(code).toContain("public class Auto {");
      expect(code).toContain("public Command command() { buildPaths();");
      expect(code).toContain(
        "return Groups.sequential( PedroCommands.follow(follower, startPointTOScore), PedroCommands.follow(follower, ScoreTOPark) );",
      );
    });

    it("tells the user to reset the scheduler and update both loops", async () => {
      const code = squash(await generate(scoreAndPark(), { library: "Ivy" }));
      expect(code).toContain("{@code Scheduler.reset();} in init()");
      expect(code).toContain("{@code follower.update();}");
      expect(code).toContain("{@code Scheduler.execute();}");
    });

    it("takes no telemetry in the constructor and gives the tracker null", async () => {
      const code = await generate(
        [line("a", "Score", { x: 20, y: 20 }, { eventMarkers: marker as any })],
        { library: "Ivy" },
      );
      expect(code).toContain("HardwareMap hw) throws IOException");
      expect(code).not.toContain("Telemetry telemetry");
      expect(code).toContain("new ProgressTracker(follower, null);");
    });

    it("waits in milliseconds, not seconds", async () => {
      const code = await generate(scoreAndPark(), {
        library: "Ivy",
        sequence: [path("a"), wait(), path("b")],
      });
      expect(code).toContain("Commands.waitMs(1500)");
      expect(code).not.toMatch(/waitMs\(1\.5/);
    });

    it("turns with Commands.instant and Commands.waitUntil", async () => {
      const code = squash(
        await generate(scoreAndPark(), {
          library: "Ivy",
          sequence: [path("a"), rotate(), path("b")],
        }),
      );
      expect(code).toContain(
        "Commands.instant(() -> { follower.hold(follower.pose().withHeading(1.571)); follower.algorithm().reset(); }), Commands.waitUntil(() -> !follower.isBusy())",
      );
    });

    it("races marker events against the wait", async () => {
      const code = squash(
        await generate(scoreAndPark(), {
          library: "Ivy",
          sequence: [path("a"), wait({ eventMarkers: marker }), path("b")],
        }),
      );
      expect(code).toContain(
        'Groups.race( Commands.waitMs(1500), Groups.sequential(Commands.waitMs(750), Commands.instant(() -> { tracker.registerEvent("raiseArm", 0.500); tracker.executeEvent("raiseArm"); }),Commands.waitMs(750)) )',
      );
    });

    it("races marker events against a turn", async () => {
      const code = squash(
        await generate(scoreAndPark(), {
          library: "Ivy",
          sequence: [path("a"), rotate({ eventMarkers: marker }), path("b")],
        }),
      );
      expect(code).toContain(
        "Groups.race( Commands.waitUntil(() -> !follower.isBusy()), Groups.sequential(",
      );
      expect(code).toContain(
        'Commands.waitUntil(() -> tracker.shouldTriggerEvent("raiseArm")), Commands.instant(() -> tracker.executeEvent("raiseArm")), Commands.waitUntil(() -> !follower.isBusy()) ))',
      );
    });
  });

  describe("turns", () => {
    const turn = (): SequenceItem =>
      ({ kind: "rotate", id: "r", name: "", degrees: 90 }) as any;

    // Pedro only marks the follower busy in follow() and algorithm().reset().
    // hold() alone leaves isBusy() false, so the wait for the turn would
    // pass immediately.
    it.each(["SolversLib", "NextFTC", "Ivy"] as const)(
      "%s resets the algorithm after holding the new heading",
      async (library) => {
        const code = squash(
          await generate(scoreAndPark(), {
            library,
            sequence: [
              { kind: "path", lineId: "a" },
              turn(),
              { kind: "path", lineId: "b" },
            ],
          }),
        );
        expect(code).toMatch(
          /follower\.hold\(follower\.pose\(\)\.withHeading\(1\.571\)\); follower\.algorithm\(\)\.reset\(\);/,
        );
      },
    );
  });

  describe("event markers", () => {
    const withMarker = () => [
      line(
        "a",
        "Score",
        { x: 20, y: 20 },
        {
          eventMarkers: [
            { id: "e", name: "raiseArm", position: 0.5, parameters: [] },
          ] as any,
        },
      ),
    ];

    it("registers them with the reader when poses are loaded at runtime", async () => {
      const code = await generate(withMarker());
      expect(code).toContain(
        '.onEvent("raiseArm", NamedCommands.getCommand("raiseArm"))',
      );
      expect(code).toContain(
        "tracker = new ProgressTracker(follower, telemetry);",
      );
      // Each path registers its own markers from the file as it starts.
      expect(code).toContain("pp.registerLineEvents(tracker, 0, 0);");
      expect(code).not.toContain("pp.registerEvents");
      expect(code).toContain("private TurtleTracerReader pp;");
    });

    it("builds the tracker directly when hardcoded", async () => {
      const code = await generate(withMarker(), { hardcode: true });
      expect(code).toContain(
        "tracker = new ProgressTracker(follower, telemetry);",
      );
      expect(code).not.toContain("pp.registerEvents");
      expect(code).not.toContain("registerLineEvents");
      expect(squash(code)).toContain(
        'tracker.onParametric(0, 0.500, NamedCommands.getCommand("raiseArm"));',
      );
    });

    it.each([
      ["SolversLib", "new RunCommand(() -> tracker.update())"],
      [
        "NextFTC",
        'new LambdaCommand("Update").setUpdate(() -> tracker.update())',
      ],
      ["Ivy", "Commands.infinite(() -> tracker.update())"],
    ] as const)(
      "%s clears, registers and updates the tracker around the path it belongs to",
      async (library, update) => {
        const code = squash(
          await generate(withMarker(), { library, hardcode: true }),
        );
        expect(code).toContain(
          "tracker.clearPathEvents(); tracker.onParametric(0, 0.500",
        );
        expect(code).toContain("tracker.setCurrentPath(startPointTOScore);");
        // The update runs alongside the follow and ends with it.
        expect(code).toMatch(
          new RegExp(
            `(ParallelRaceGroup|Groups.race)\\( .*startPointTOScore.*${update.replaceAll(/[()]/g, String.raw`\$&`)}`,
          ),
        );
      },
    );

    it("scopes each marker to its line's place in the chain", async () => {
      const lines = [
        line("a", "One", { x: 20, y: 20 }),
        line(
          "b",
          "Two",
          { x: 30, y: 20 },
          {
            isChain: true,
            eventMarkers: [
              { id: "e", name: "raiseArm", position: 0.25, parameters: [] },
            ] as any,
          },
        ),
      ];
      const hard = squash(await generate(lines, { hardcode: true }));
      expect(hard).toContain(
        'tracker.onParametric(1, 0.250, NamedCommands.getCommand("raiseArm"));',
      );
      const read = squash(await generate(lines));
      expect(read).toContain("pp.registerLineEvents(tracker, 1, 1);");
    });

    it("keeps a path without markers free of tracker calls", async () => {
      const lines = [...withMarker(), line("b", "Park", { x: 40, y: 20 })];
      const code = squash(await generate(lines, { hardcode: true }));
      expect(code).toContain("tracker.setCurrentPath(startPointTOScore)");
      expect(code).not.toContain("tracker.setCurrentPath(ScoreTOPark)");
    });

    it("passes null instead of telemetry for NextFTC", async () => {
      const code = await generate(withMarker(), { library: "NextFTC" });
      expect(code).toContain("new ProgressTracker(follower, null);");
    });

    it.each(["SolversLib", "NextFTC", "Ivy"] as const)(
      "%s keeps the tracker in a field its commands can reach",
      async (library) => {
        const code = await generate(withMarker(), { library });
        expect(code).toContain("private ProgressTracker tracker;");
        expect(code).not.toContain("progressTracker");
      },
    );

    it("declares the tracker when only a wait has markers", async () => {
      const code = await generate(scoreAndPark(), {
        sequence: [
          { kind: "path", lineId: "a" },
          {
            kind: "wait",
            id: "w",
            name: "",
            durationMs: 1000,
            eventMarkers: [
              { id: "e", name: "raiseArm", position: 0.5, parameters: [] },
            ],
          } as any,
          { kind: "path", lineId: "b" },
        ],
      });
      expect(code).toContain("private ProgressTracker tracker;");
      expect(code).toContain(
        "tracker = new ProgressTracker(follower, telemetry);",
      );
      expect(code).toContain(
        '.onEvent("raiseArm", NamedCommands.getCommand("raiseArm"))',
      );
      // Registered first, since executeEvent skips events it doesn't know.
      expect(squash(code)).toContain(
        'tracker.registerEvent("raiseArm", 0.500); tracker.executeEvent("raiseArm");',
      );
    });

    it("adds no tracker when nothing has markers", async () => {
      expect(await generate(scoreAndPark())).not.toContain("ProgressTracker");
    });
  });
});
