// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { calculatePathTime } from "../utils/timeCalculator";
import {
  maxSpeedOf,
  setSpeedOf,
  validSpeed,
} from "../utils/timeCalculator/speedCap";
import {
  fastestSpeedThatFixes,
  followsBends,
  latestStartThatFixes,
  type FixContext,
} from "../utils/timeCalculator/fixSearch";
import { fallsShort } from "../utils/timeCalculator/advice";
import { computePathStatistics } from "../utils/pathStatistics";
import { normalizeLines } from "../lib/projectStore";
import { toggleChain } from "../lib/sequenceOperations";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import { readPedroJava } from "../utils/javaImporter/pedroReader";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const settings = { ...DEFAULT_SETTINGS } as Settings;
const start: Point = { x: 10, y: 72, heading: "constant", degrees: 0 } as Point;

const line = (
  id: string,
  x: number,
  y = 72,
  over: Partial<Line> = {},
): Line => ({
  id,
  name: id.toUpperCase(),
  endPoint: { x, y, heading: "constant", degrees: 0 } as Point,
  controlPoints: [],
  color: "#000",
  ...over,
});

const pathItem = (l: Line): SequenceItem => ({
  kind: "path",
  lineId: l.id!,
  ...(l.isChain ? { isChain: true } : {}),
});

const timed = (lines: Line[], over: Partial<Settings> = {}) =>
  calculatePathTime(
    start,
    lines,
    { ...settings, ...over },
    lines.map(pathItem),
  );

const travels = (lines: Line[], over: Partial<Settings> = {}) =>
  timed(lines, over).timeline.filter((e) => e.type === "travel");

const peak = (lines: Line[], name: string) =>
  Math.max(
    ...travels(lines).find((e) => e.line?.name === name)!.velocityProfile!,
  );

describe("which speed applies", () => {
  const chainOf = (root: Partial<Line>, member: Partial<Line> = {}) => {
    const a = line("a", 70, 72, root);
    const b = line("b", 130, 72, { isChain: true, ...member });
    return [a, b];
  };

  it("takes a path's own speed before its chain's, even a higher one", () => {
    const [a, b] = chainOf({ chainMaxSpeed: 15 }, { maxSpeed: 35 });
    expect(setSpeedOf(a, a)).toBe(15);
    expect(setSpeedOf(b, a)).toBe(35);
  });

  it("falls back to the chain's, then to nothing", () => {
    const [a, b] = chainOf({ chainMaxSpeed: 15 });
    expect(setSpeedOf(b, a)).toBe(15);
    expect(setSpeedOf(line("x", 1), undefined)).toBeUndefined();
  });

  it("never goes past the robot's Max Velocity", () => {
    const [a, b] = chainOf({ chainMaxSpeed: 15 }, { maxSpeed: 500 });
    expect(maxSpeedOf(b, a, settings)).toBe(settings.maxVelocity);
    expect(maxSpeedOf(a, a, settings)).toBe(15);
    expect(maxSpeedOf(line("x", 1), undefined, settings)).toBe(
      settings.maxVelocity,
    );
  });

  it("ignores anything that isn't a number above zero", () => {
    for (const bad of [0, -3, Number.NaN, Infinity, "20", null, undefined]) {
      expect(validSpeed(bad)).toBeUndefined();
    }
    expect(validSpeed(12.5)).toBe(12.5);
    const [loaded] = normalizeLines([
      { ...line("a", 50), maxSpeed: -4, chainMaxSpeed: "fast" as never },
    ]);
    expect(loaded.maxSpeed).toBeUndefined();
    expect(loaded.chainMaxSpeed).toBeUndefined();
  });
});

describe("driving at a set speed", () => {
  it("limits a path to its Max Speed, and takes longer", () => {
    const free = line("a", 130);
    const slow = line("a", 130, 72, { maxSpeed: 20 });
    expect(peak([free], "A")).toBeCloseTo(settings.maxVelocity);
    expect(peak([slow], "A")).toBeCloseTo(20);
    expect(timed([slow]).totalTime).toBeGreaterThan(timed([free]).totalTime);
  });

  it("limits a lone path to its chain speed too, as Pedro does for a path of one", () => {
    expect(peak([line("a", 130, 72, { chainMaxSpeed: 20 })], "A")).toBeCloseTo(
      20,
    );
  });

  it("limits every path of a chain to the chain's speed", () => {
    const lines = [
      line("a", 70, 72, { chainMaxSpeed: 18 }),
      line("b", 130, 72, { isChain: true }),
    ];
    expect(peak(lines, "A")).toBeCloseTo(18);
    expect(peak(lines, "B")).toBeCloseTo(18);
  });

  it("lets a path in the chain go faster than the chain, with a speed of its own", () => {
    const lines = [
      line("a", 70, 72, { chainMaxSpeed: 15 }),
      line("b", 130, 72, { isChain: true, maxSpeed: 35 }),
    ];
    expect(peak(lines, "A")).toBeCloseTo(15);
    expect(peak(lines, "B")).toBeCloseTo(35);
  });

  it("coasts down into a slower path rather than dropping to its speed at once", () => {
    const lines = [
      line("a", 70),
      line("b", 130, 72, { isChain: true, maxSpeed: 15 }),
    ];
    const b = travels(lines).find((e) => e.line?.name === "B")!;
    const speeds = b.velocityProfile!;
    // It arrives fast, and is slowed to the cap further along: there are
    // steps at speeds between the two.
    expect(speeds[0]).toBeGreaterThan(30);
    // Well along the path it is at the cap (the end is where it brakes to a stop).
    expect(speeds[Math.round(speeds.length * 0.8)]).toBeCloseTo(15, 0);
    const between = speeds.filter((v) => v > 17 && v < 30);
    expect(between.length).toBeGreaterThan(3);
    // And no faster than the natural slowing allows.
    const decel = 0.8 * (settings.maxDeceleration || settings.maxAcceleration);
    const times = b.motionProfile!;
    for (let i = 1; i < speeds.length - 1; i++) {
      const dt = times[i + 1] - times[i];
      if (dt < 1e-6 || speeds[i] <= 15) continue;
      expect((speeds[i] - speeds[i + 1]) / dt).toBeLessThan(decel * 1.5 + 1);
    }
  });

  it("holds the whole run to the robot's Max Velocity", () => {
    const fast = line("a", 130, 72, { maxSpeed: 400 });
    expect(peak([fast], "A")).toBeCloseTo(settings.maxVelocity);
  });

  it("is left alone when no speed is set", () => {
    const lines = [line("a", 70), line("b", 130, 72, { isChain: true })];
    const withKeys = lines.map((l) => ({ ...l, maxSpeed: undefined }));
    expect(timed(withKeys).totalTime).toBe(timed(lines).totalTime);
  });
});

// A bend of radius under an inch, taken at full speed.
const hairpin: Line = {
  id: "h",
  name: "Hairpin",
  endPoint: { x: 93.7, y: 14.6, heading: "constant", degrees: 0 } as Point,
  controlPoints: [{ x: 105, y: 59.25 }],
  color: "#c05",
};
const hairpinStart: Point = {
  x: 81,
  y: 11.4,
  heading: "constant",
  degrees: 0,
} as Point;

describe("speeds the advice suggests", () => {
  const ctx = (lines: Line[]): FixContext => ({
    startPoint: hairpinStart,
    lines,
    sequence: lines.map(pathItem),
    settings,
  });

  it("finds a Max Speed at which the robot follows a bend", () => {
    const lines = [hairpin];
    const speed = fastestSpeedThatFixes(
      ctx(lines),
      0,
      (event) => event.excursion === undefined,
    );
    expect(speed).not.toBeNull();
    // It really does follow the bend at that speed, and not at a faster one.
    const at = (v: number) =>
      calculatePathTime(hairpinStart, [{ ...hairpin, maxSpeed: v }], settings, [
        pathItem(hairpin),
      ]).timeline.find((e) => e.type === "travel")!;
    expect(at(speed!).excursion).toBeUndefined();
    expect(at(speed! + 2).excursion).toBeDefined();
  });

  it("names that speed in Path Statistics", () => {
    const stats = computePathStatistics(
      hairpinStart,
      [hairpin],
      [pathItem(hairpin)],
      settings,
    );
    const note = stats.insights.find((i) => i.message.includes("too tight"))!;
    const speed = fastestSpeedThatFixes(
      ctx([hairpin]),
      0,
      followsBends(settings),
    );
    expect(note.message).toContain(`Max Speed to ${speed} in/s or less`);
  });

  it("finds it when the path's top speed isn't a whole number", () => {
    // Halving between a whole and a fractional bound can stand still, which
    // once left this search going round forever.
    for (const maxVelocity of [39.7, 40.0000001, 33.3, 12.49]) {
      const tuned = { ...settings, maxVelocity };
      const speed = fastestSpeedThatFixes(
        { ...ctx([hairpin]), settings: tuned },
        0,
        (event) => event.excursion === undefined,
      );
      expect(speed === null || Number.isInteger(speed)).toBe(true);
      if (speed !== null) {
        expect(speed).toBeLessThanOrEqual(Math.ceil(maxVelocity));
        const timed = calculatePathTime(
          hairpinStart,
          [{ ...hairpin, maxSpeed: speed }],
          tuned,
          [pathItem(hairpin)],
        ).timeline.find((e) => e.type === "travel")!;
        expect(timed.excursion).toBeUndefined();
      }
    }
  });

  it("gives no speed when the robot would have to crawl", () => {
    // Held to 5 in/s or more, a robot this slow still can't take a bend
    // this tight on a track with no grip to speak of.
    expect(
      fastestSpeedThatFixes(
        {
          ...ctx([hairpin]),
          settings: { ...settings, kFriction: 0, maxAcceleration: 1 },
        },
        0,
        (event) => event.excursion === undefined,
      ),
    ).toBeNull();
  });

  describe("for a piecewise heading", () => {
    // A quarter turn in the last few percent of a long path.
    const turning = (tStart: number): Line => ({
      id: "p",
      name: "Turning",
      endPoint: {
        x: 130,
        y: 72,
        heading: "piecewise",
        segments: [
          { tStart: 0, tEnd: tStart, heading: "constant", degrees: 0 },
          {
            tStart,
            tEnd: 1,
            heading: "linear",
            startDeg: 0,
            endDeg: 90,
          },
        ],
      },
      controlPoints: [],
      color: "#0a5",
    });
    const piecewiseCtx = (l: Line): FixContext => ({
      startPoint: start,
      lines: [l],
      sequence: [pathItem(l)],
      settings,
    });
    const shortOf = (l: Line) =>
      timed([l]).timeline.find((e) => e.type === "travel")!
        .piecewiseShortfalls![1];

    it("starts the segment where it finishes turning", () => {
      const late = turning(0.95);
      expect(fallsShort(shortOf(late))).toBe(true);
      const fix = latestStartThatFixes(piecewiseCtx(late), 0, 1);
      expect(fix).not.toBeNull();
      expect(fix!.t).toBeLessThan(0.95);
      const earlier = turning(fix!.t);
      expect(fallsShort(shortOf(earlier))).toBe(false);
    });

    it("has no start to move for the first segment", () => {
      expect(
        latestStartThatFixes(piecewiseCtx(turning(0.95)), 0, 0),
      ).toBeNull();
    });

    it("finds a Max Speed at which the segment finishes", () => {
      const late = turning(0.95);
      const speed = fastestSpeedThatFixes(
        piecewiseCtx(late),
        0,
        (event) => !fallsShort(event.piecewiseShortfalls?.[1]),
      );
      expect(speed).not.toBeNull();
      const slowed = { ...late, maxSpeed: speed! };
      expect(fallsShort(shortOf(slowed))).toBe(false);
    });
  });
});

describe("chains", () => {
  const chained = () => {
    const lines = [line("a", 50, 72, { chainMaxSpeed: 20 }), line("b", 90, 72)];
    const sequence: SequenceItem[] = lines.map(pathItem);
    return { lines, sequence };
  };

  it("drops a path's own chain speed when it joins a chain", () => {
    const { lines, sequence } = chained();
    // b has a speed for a chain of its own, which joining a chain ends.
    lines[1] = { ...lines[1], chainMaxSpeed: 33 };
    const joined = toggleChain(lines, sequence, 1);
    expect(joined.lines[1].isChain).toBe(true);
    expect(joined.lines[1].chainMaxSpeed).toBeUndefined();
    // The chain's speed stays with the path that starts it.
    expect(joined.lines[0].chainMaxSpeed).toBe(20);
  });

  it("keeps the speeds when a chain is split", () => {
    const { lines, sequence } = chained();
    const joined = toggleChain(lines, sequence, 1);
    const split = toggleChain(joined.lines, joined.sequence, 1);
    expect(split.lines[0].chainMaxSpeed).toBe(20);
  });
});

describe("export", () => {
  const speedy: Line[] = [
    line("a", 30, 20, { chainMaxSpeed: 25 }),
    line("b", 50, 20, { isChain: true, maxSpeed: 40 }),
    line("c", 70, 20, { isChain: true }),
    line("d", 90, 20, { maxSpeed: 12.5 }),
    line("e", 110, 20, { chainMaxSpeed: 20 }),
    line("f", 130, 20),
  ].map((l) => ({
    ...l,
    endPoint: { ...l.endPoint, heading: "tangential", reverse: false },
  })) as Line[];
  const sequence = speedy.map(pathItem);
  const exportStart = {
    x: 10,
    y: 20,
    heading: "constant",
    degrees: 0,
  } as Point;
  const modifier = (speed: string) =>
    `.with(Constants.foresightConfig.maxVelocityConstraint.at(${speed}))`;
  const squash = (code: string) => code.replaceAll(/\s+/g, " ");

  const stateMachine = () =>
    generateJavaCode(exportStart, speedy, true, sequence);
  const commands = (
    library: "SolversLib" | "NextFTC" | "Ivy",
    language: "java" | "kotlin",
  ) =>
    generateSequentialCommandCode(
      exportStart,
      speedy,
      "Auto.turt",
      sequence,
      library,
      "org.team.Commands",
      true,
      "Pedro",
      "imperial",
      language,
    );

  it("limits the chain on the path(...) and its paths on their own calls", async () => {
    const code = squash(await stateMachine());
    // The override sits on its path inside the chain, and the chain's speed
    // after the chain's closing bracket.
    expect(code).toContain(`.tangent() ${modifier("40.0")},`);
    expect(code).toContain(modifier("40.0"));
    expect(code).toContain(`)${modifier("25.0")};`);
    // A path on its own takes its own speed, or else its chain's.
    expect(code).toContain(modifier("12.5"));
    expect(code).toContain(modifier("20.0"));
  });

  it("writes whole speeds with a decimal point, which Java needs", async () => {
    const code = await stateMachine();
    expect(code).toContain(".at(25.0)");
    expect(code).not.toMatch(/\.at\(\d+\)/);
  });

  it("explains the build error it can cause, where the speeds are set, in the language it is written in", async () => {
    for (const code of [
      await stateMachine(),
      await commands("SolversLib", "java"),
    ]) {
      expect(code).toContain("Constants.foresightConfig");
      expect(code).toContain('"cannot find symbol ... foresightConfig"');
      expect(code).toContain("public static ForesightConfig foresightConfig");
      expect(code).not.toContain("Unresolved reference");
    }
    for (const code of [
      await commands("NextFTC", "kotlin"),
      await commands("Ivy", "kotlin"),
    ]) {
      expect(code).toContain("Constants.foresightConfig");
      expect(code).toContain(`"Unresolved reference 'foresightConfig'"`);
      expect(code).toContain("@JvmField var foresightConfig");
      expect(code).not.toContain("cannot find symbol");
    }
  });

  it("imports Constants where the code needs it, and only then", async () => {
    const java = await commands("SolversLib", "java");
    expect(java).toContain(
      "import org.firstinspires.ftc.teamcode.pedro.Constants;",
    );
    const kotlin = await commands("Ivy", "kotlin");
    expect(kotlin).toContain(
      "import org.firstinspires.ftc.teamcode.pedro.Constants\n",
    );

    const plain = speedy.map((l) => ({
      ...l,
      maxSpeed: undefined,
      chainMaxSpeed: undefined,
    }));
    const code = await generateSequentialCommandCode(
      exportStart,
      plain,
      "Auto.turt",
      plain.map(pathItem),
      "SolversLib",
      "org.team.Commands",
      true,
      "Pedro",
      "imperial",
      "java",
    );
    expect(code).not.toContain("Constants");
    expect(code).not.toContain("foresightConfig");
  });

  it.each([
    ["state machine, Java", () => stateMachine(), "java"],
    ["SolversLib, Java", () => commands("SolversLib", "java"), "java"],
    ["NextFTC, Kotlin", () => commands("NextFTC", "kotlin"), "kotlin"],
    ["Ivy, Java", () => commands("Ivy", "java"), "java"],
  ] as const)("reads back what %s wrote", async (_name, generate, language) => {
    const { project, notes } = readPedroJava(await generate(), { language });
    expect(notes).toEqual([]);
    const read = project.lines.map((l) => [
      l.isChain ? "chained" : "root",
      l.maxSpeed,
      l.chainMaxSpeed,
    ]);
    expect(read).toEqual([
      ["root", undefined, 25],
      ["chained", 40, undefined],
      ["chained", undefined, undefined],
      ["root", 12.5, undefined],
      // A chain of one is written as its path's own speed.
      ["root", 20, undefined],
      ["root", undefined, undefined],
    ]);
  });

  it("leaves out a modifier it doesn't read, and says so, rather than losing the path", () => {
    const code = `
      public class Paths {
        public Path a;
        public Paths(Follower follower) {
          PoseFactory p = PoseFactory.degrees();
          a = line(p.of(10, 10, 0), p.of(40, 10, 0))
            .tangent()
            .with(Constants.foresightConfig.maxPathSpeed.at(0.5));
        }
      }`;
    const { project, notes } = readPedroJava(code, { language: "java" });
    expect(project.lines).toHaveLength(1);
    expect(project.lines[0].maxSpeed).toBeUndefined();
    expect(notes.some((n) => n.message.includes("maxPathSpeed"))).toBe(true);
  });
});
