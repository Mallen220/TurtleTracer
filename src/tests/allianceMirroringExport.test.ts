// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exports for TurtleTracerLib's auto selector: every pose and heading written
// into the code goes through an AutoContext, so the same code runs mirrored
// on the other alliance. Each project says whether it mirrors and which
// alliance it is drawn for.
import { describe, it, expect, vi, beforeAll } from "vitest";

// Skip prettier: the tests check the generated text, not its layout.
vi.mock("prettier", () => ({
  default: { format: vi.fn(async (code: string) => code) },
}));
vi.mock("prettier-plugin-java", () => ({ default: {} }));

import { generateSequentialCommandCode } from "../lib/exporters/sequentialExporter";
import { generateJavaCode } from "../lib/exporters/javaExporter";
import { exporterRegistry } from "../lib/exporters";
import {
  MIRRORING_KEY,
  projectMirroring,
  projectAlliance,
  projectExportAlliance,
  withProjectAlliance,
  type DrawnFor,
} from "../lib/exporters/allianceMirroring";
import { registerCoreUI } from "../lib/coreRegistrations";
import { get } from "svelte/store";
import type {
  CodeLanguage,
  CommandLibraryId,
  Line,
  Point,
  SequenceItem,
} from "../types";

beforeAll(() => registerCoreUI());

const start: Point = { x: 10, y: 10, heading: "constant", degrees: 0 };
const lines: Line[] = [
  {
    id: "a",
    name: "Score",
    endPoint: {
      x: 40,
      y: 20,
      heading: "linear",
      startDeg: 0,
      endDeg: 90,
    } as Point,
    controlPoints: [{ x: 25, y: 5 }],
    color: "red",
    eventMarkers: [
      {
        id: "m",
        name: "Drop",
        type: "pose",
        position: 0.5,
        poseX: 30,
        poseY: 12,
        poseHeading: 45,
      } as any,
    ],
  },
  {
    id: "b",
    name: "Park",
    endPoint: {
      x: 60,
      y: 60,
      heading: "facingPoint",
      targetX: 72,
      targetY: 72,
    } as Point,
    controlPoints: [],
    color: "red",
  },
];
const sequence: SequenceItem[] = [
  { kind: "path", lineId: "a" },
  { kind: "rotate", id: "r", name: "", degrees: 90 } as any,
  { kind: "path", lineId: "b" },
];

const sequential = (
  o: {
    drawnFor?: DrawnFor | null;
    /** Whether the project mirrors (true unless said); false records the alliance only. */
    mirror?: boolean;
    hardcode?: boolean;
    library?: CommandLibraryId;
    language?: CodeLanguage;
  } = {},
) =>
  generateSequentialCommandCode(
    start,
    lines,
    "Auto.turt",
    sequence,
    o.library ?? "SolversLib",
    "org.team",
    o.hardcode ?? false,
    "Pedro",
    "imperial",
    o.language ?? "java",
    o.drawnFor === null
      ? undefined
      : { drawnFor: o.drawnFor ?? "BLUE", mirror: o.mirror ?? true },
  );

const opMode = (language: CodeLanguage = "java", mirror = true) =>
  generateJavaCode(
    start,
    lines,
    true,
    sequence,
    "org.team",
    "Standard",
    "Pedro",
    "imperial",
    "Auto.turt",
    language,
    undefined,
    mirror ? { drawnFor: "BLUE", axes: "X" } : undefined,
  );

/** Every `p.of(...)` and `Math.toRadians(...)` written in the code. */
const literals = (code: string) => [
  ...(code.match(/(?:p\.of|Math\.toRadians)\([^()]*\)/g) ?? []),
];

/** Whether every literal pose and angle is wrapped in ctx.pose / ctx.heading. */
const allMirrored = (code: string) =>
  literals(code).every(
    (lit) =>
      code.includes(`ctx.pose(${lit}`) || code.includes(`ctx.heading(${lit}`),
  );

describe("project alliance settings", () => {
  it("default to no alliance, so exports don't need TurtleTracerLib", () => {
    expect(projectAlliance(undefined)).toEqual({
      drawnFor: "NONE",
      mirror: false,
    });
    expect(projectAlliance({})).toEqual({ drawnFor: "NONE", mirror: false });
    expect(
      projectAlliance({ [MIRRORING_KEY]: { drawnFor: "GREEN", mirror: true } }),
    ).toEqual({ drawnFor: "NONE", mirror: false });
    expect(projectExportAlliance({})).toBeUndefined();
  });

  it("never mirror without an alliance", () => {
    const none = { [MIRRORING_KEY]: { drawnFor: "NONE", mirror: true } };
    expect(projectAlliance(none)).toEqual({ drawnFor: "NONE", mirror: false });
    expect(projectMirroring(none)).toBeUndefined();
    expect(
      projectAlliance(withProjectAlliance(none, { mirror: true })),
    ).toEqual({ drawnFor: "NONE", mirror: false });
  });

  it("give exports the alliance whether or not it mirrors", () => {
    expect(
      projectExportAlliance({
        [MIRRORING_KEY]: { drawnFor: "BLUE", mirror: false },
      }),
    ).toEqual({ drawnFor: "BLUE", mirror: false });
    expect(
      projectMirroring({
        [MIRRORING_KEY]: { drawnFor: "BLUE", mirror: false },
      }),
    ).toBeUndefined();
    expect(
      projectMirroring({ [MIRRORING_KEY]: { drawnFor: "BLUE", mirror: true } }),
    ).toBe("BLUE");
  });

  it("are changed without touching the project's other data, and not saved when default", () => {
    const red = withProjectAlliance(
      { strategyNotes: "left" },
      { drawnFor: "RED" },
    );
    expect(red).toEqual({
      strategyNotes: "left",
      [MIRRORING_KEY]: { drawnFor: "RED", mirror: false },
    });
    const mirrored = withProjectAlliance(red, { mirror: true });
    expect(projectAlliance(mirrored)).toEqual({
      drawnFor: "RED",
      mirror: true,
    });
    // Back to no alliance: nothing is left in the project.
    expect(withProjectAlliance(mirrored, { drawnFor: "NONE" })).toEqual({
      strategyNotes: "left",
    });
  });
});

describe("sequential export with alliance mirroring", () => {
  it("is unchanged when the project doesn't mirror", async () => {
    const code = await sequential({ drawnFor: null });
    expect(code).not.toContain("ctx");
    expect(code).not.toContain("AutoContext");
  });

  it.each(["SolversLib", "NextFTC", "Ivy"] as const)(
    "%s takes an AutoContext and decides for the side the project is drawn for",
    async (library) => {
      const java = await sequential({ library });
      expect(java).toContain("import com.turtletracerlib.auto.Alliance;");
      expect(java).toContain("import com.turtletracerlib.auto.AutoContext;");
      expect(java).toMatch(
        /HardwareMap hw(, Telemetry telemetry)?, AutoContext autoContext\)/,
      );
      expect(java).toContain("private final AutoContext ctx;");
      // The code says it mirrors, whatever the selector's config says, and
      // records what it decided for TeleOp.
      expect(java).toContain(
        "this.ctx = autoContext.drawnFor(Alliance.BLUE).mirroring(MirrorPolicy.FOLLOW_ALLIANCE);",
      );
      expect(java).toContain("AutoSelection.record(ctx);");
      expect(java).toContain("import com.turtletracerlib.auto.MirrorPolicy;");
      expect(java).toContain(
        'TurtleTracerReader("Auto.turt", hw.appContext).mirrored(ctx.mirror())',
      );
      // ctx is set before anything uses it.
      expect(java.indexOf("this.ctx =")).toBeLessThan(
        java.indexOf("ctx.mirror()"),
      );

      const kotlin = await sequential({ library, language: "kotlin" });
      expect(kotlin).toContain("import com.turtletracerlib.auto.Alliance\n");
      expect(kotlin).toContain("import com.turtletracerlib.auto.AutoContext\n");
      expect(kotlin).toContain("autoContext: AutoContext,");
      expect(kotlin).toContain(
        "private val ctx = autoContext.drawnFor(Alliance.BLUE).mirroring(MirrorPolicy.FOLLOW_ALLIANCE)",
      );
      expect(kotlin).toMatch(/init \{\s+AutoSelection\.record\(ctx\)/);
      expect(kotlin).toContain(".mirrored(ctx.mirror())");
    },
  );

  it("writes the project's own alliance", async () => {
    const red = await sequential({ drawnFor: "RED" });
    expect(red).toContain(
      "autoContext.drawnFor(Alliance.RED).mirroring(MirrorPolicy.FOLLOW_ALLIANCE)",
    );
    expect(red).toContain("for paths drawn for RED");
  });

  it("builds curves from the mirrored control point fields", async () => {
    const code = await sequential();
    expect(code).toContain(
      'Score_line0_control1 = pp.get("Score_line0_control1")',
    );
    expect(code).toContain("curve(startPoint, Score_line0_control1, Score)");
    expect(code).not.toContain("p.of(25.000, 5.000");
  });

  it("mirrors headings, facing points and turns written into the code", async () => {
    const code = await sequential();
    expect(code).toContain(
      ".linear(ctx.heading(Math.toRadians(0)), ctx.heading(Math.toRadians(90)))",
    );
    expect(code).toContain(".facingPoint(ctx.pose(p.of(72.000, 72.000, 0.0)))");
    expect(code).toContain("withHeading(ctx.heading(1.571))");
    expect(code).toContain(
      "Angle.error(follower.pose().heading(), ctx.heading(1.571))",
    );
    expect(allMirrored(code)).toBe(true);
  });

  it("mirrors every embedded pose, and pose markers", async () => {
    const code = await sequential({ hardcode: true });
    expect(code).toContain("startPoint = ctx.pose(p.of(10.000, 10.000, 0))");
    expect(code).toContain(
      "Score_line0_control1 = ctx.pose(p.of(25.000, 5.000, 0.0))",
    );
    expect(code).toContain(
      "tracker.onSpatial(ctx.pose(p.of(30.000, 12.000, 45.000))",
    );
    expect(code).not.toContain("TurtleTracerReader");
    expect(allMirrored(code)).toBe(true);
  });

  it("documents the Ivy constructor with ctx", async () => {
    const code = await sequential({ library: "Ivy" });
    expect(code).toContain(
      "new Auto(follower, hardwareMap, ctx).command().schedule();",
    );
  });
});

describe("OpMode export with alliance mirroring", () => {
  it("is unchanged when the project doesn't mirror", async () => {
    const code = await opMode("java", false);
    expect(code).not.toContain("ctx");
    expect(code).not.toContain("init_loop");
    expect(code).toContain("paths = new Paths(follower);");
  });

  it("shows an alliance menu in init and builds the paths at start", async () => {
    const code = await opMode();
    expect(code).toContain("import com.turtletracerlib.auto.AutoSelector;");
    expect(code).toContain(
      'new AutoRegistry<AutoContext>().add("Auto", c -> c)',
    );
    expect(code).toContain(".baseAlliance(Alliance.BLUE)");
    expect(code).toContain(".mirrorAxes(MirrorAxes.X)");
    expect(code).toContain("selector.update(gamepad1, telemetry);");
    expect(code).toContain("ctx = selector.buildSelected();");
    expect(code).toContain(
      "follower.setPose(ctx.pose(p.of(10.000, 10.000, 0.000)));",
    );
    expect(code).toContain("paths = new Paths(follower, ctx);");
    expect(code).toContain("public Paths(Follower follower, AutoContext ctx)");
    // The pose is set once the alliance is known, not in init().
    const init = code.slice(
      code.indexOf("void init()"),
      code.indexOf("void init_loop()"),
    );
    expect(init).not.toContain("setPose");
    expect(init).not.toContain("new Paths");
  });

  it("mirrors every pose, heading and turn", async () => {
    const code = await opMode();
    expect(code).toContain("withHeading(ctx.heading(1.571))");
    expect(code).toContain(
      "tracker.onSpatial(ctx.pose(p.of(30.000, 12.000, 45.000))",
    );
    expect(allMirrored(code)).toBe(true);
  });

  it("writes the same in Kotlin", async () => {
    const code = await opMode("kotlin");
    expect(code).toContain("import com.turtletracerlib.auto.AutoSelector\n");
    expect(code).toContain("private lateinit var ctx: AutoContext");
    expect(code).toContain('AutoRegistry<AutoContext>().add("Auto") { it }');
    expect(code).toContain("override fun init_loop()");
    expect(code).toContain("override fun start()");
    expect(code).toContain("class Paths(ctx: AutoContext)");
    expect(code).toContain("paths = Paths(ctx)");
    expect(allMirrored(code)).toBe(true);
  });
});

describe("exporters read mirroring from the project", () => {
  const project = (drawnFor?: DrawnFor) => ({
    startPoint: start,
    lines,
    sequence,
    shapes: [],
    extraData: drawnFor
      ? withProjectAlliance({}, { drawnFor, mirror: true })
      : // Drawn for blue but not mirrored: exports as drawn.
        withProjectAlliance({}, { drawnFor: "BLUE", mirror: false }),
  });

  it("the sequential exporter mirrors only projects that ask for it", async () => {
    const exporter = get(exporterRegistry).sequential;
    const settings = { fileName: "Auto", hardcodeValues: false };
    const blue = await exporter.exportCode(project("BLUE"), settings);
    const red = await exporter.exportCode(project("RED"), settings);
    const off = await exporter.exportCode(project(), settings);
    expect(blue).toContain(
      "autoContext.drawnFor(Alliance.BLUE).mirroring(MirrorPolicy.FOLLOW_ALLIANCE)",
    );
    expect(red).toContain(
      "autoContext.drawnFor(Alliance.RED).mirroring(MirrorPolicy.FOLLOW_ALLIANCE)",
    );
    expect(off).not.toContain("AutoContext");
  });

  it("the OpMode exporter takes the side from the project and the axes from settings", async () => {
    const exporter = get(exporterRegistry).java;
    const code = await exporter.exportCode(project("BLUE"), {
      fileName: "Auto",
      exportMirrorAxes: "Y",
    });
    expect(code).toContain(".baseAlliance(Alliance.BLUE)");
    expect(code).toContain(".mirrorAxes(MirrorAxes.Y)");

    const defaults = await exporter.exportCode(project("RED"), {
      fileName: "Auto",
    });
    expect(defaults).toContain(".baseAlliance(Alliance.RED)");
    expect(defaults).toContain(".mirrorAxes(MirrorAxes.BOTH)");

    const off = await exporter.exportCode(project(), {
      fileName: "Auto",
      exportMirrorAxes: "Y",
    });
    expect(off).not.toContain("AutoSelector");
  });
});

describe("TurtleTracerLib stays optional", () => {
  // The same paths without event markers, which need TurtleTracerLib.
  const plainLines = lines.map(({ eventMarkers: _markers, ...line }) => line);
  const plainSequence: SequenceItem[] = [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b" },
  ];

  const sequentialPlain = (
    library: CommandLibraryId,
    language: CodeLanguage,
    alliance?: { drawnFor: DrawnFor; mirror: boolean },
  ) =>
    generateSequentialCommandCode(
      start,
      plainLines,
      "Auto.turt",
      plainSequence,
      library,
      "org.team",
      true, // embedded poses: no TurtleTracerReader either
      "Pedro",
      "imperial",
      language,
      alliance,
    );

  const opModePlain = (language: CodeLanguage, recordAlliance?: DrawnFor) =>
    generateJavaCode(
      start,
      plainLines,
      true,
      plainSequence,
      "org.team",
      "Standard",
      "Pedro",
      "imperial",
      "Auto.turt",
      language,
      undefined,
      undefined,
      recordAlliance,
    );

  const LIBRARIES = ["SolversLib", "NextFTC", "Ivy"] as const;
  const LANGUAGES = ["java", "kotlin"] as const;

  it.each(LIBRARIES.flatMap((l) => LANGUAGES.map((g) => [l, g] as const)))(
    "%s %s code without markers or an alliance doesn't mention TurtleTracerLib",
    async (library, language) => {
      const code = await sequentialPlain(library, language);
      expect(code.toLowerCase()).not.toContain("turtletracerlib");
    },
  );

  it.each(LANGUAGES)(
    "a %s OpMode without markers or an alliance doesn't mention TurtleTracerLib",
    async (language) => {
      const code = await opModePlain(language);
      expect(code.toLowerCase()).not.toContain("turtletracerlib");
    },
  );

  it("imports the event classes only for paths with event markers", async () => {
    const plain = await sequentialPlain("SolversLib", "java");
    expect(plain).not.toContain("NamedCommands");
    expect(plain).not.toContain("ProgressTracker");

    const marked = await sequential({ drawnFor: null, hardcode: true });
    expect(marked).toContain(
      "import com.turtletracerlib.pathing.NamedCommands;",
    );
    expect(marked).toContain(
      "import com.turtletracerlib.pathing.ProgressTracker;",
    );
  });

  it("imports only the reader, and the annotation it makes possible, when poses are read from the file", async () => {
    const code = await generateSequentialCommandCode(
      start,
      plainLines,
      "Auto.turt",
      plainSequence,
      "SolversLib",
      "org.team",
      false,
    );
    const imports = code.match(/import com\.turtletracerlib\.[\w.]+/g) ?? [];
    expect(imports.sort()).toEqual([
      "import com.turtletracerlib.TurtleTracerReader",
      "import com.turtletracerlib.auto.TurtleAuto",
    ]);
  });
});

describe("an alliance without mirroring", () => {
  it.each(["SolversLib", "NextFTC", "Ivy"] as const)(
    "%s records the alliance in the auto, and nothing else",
    async (library) => {
      const java = await sequential({ library, mirror: false });
      expect(java).toContain("import com.turtletracerlib.auto.Alliance;");
      expect(java).toContain("import com.turtletracerlib.auto.AutoSelection;");
      expect(java).toContain("AutoSelection.record(Alliance.BLUE, false);");
      expect(java).not.toContain("AutoContext");
      expect(java).not.toContain("ctx.");

      const kotlin = await sequential({
        library,
        mirror: false,
        language: "kotlin",
      });
      expect(kotlin).toContain(
        "import com.turtletracerlib.auto.AutoSelection\n",
      );
      expect(kotlin).toMatch(
        /AutoSelection\.record\(Alliance\.BLUE, false\)\n/,
      );
      expect(kotlin).not.toContain("AutoContext");
    },
  );

  it("writes the project's own alliance", async () => {
    const red = await sequential({ drawnFor: "RED", mirror: false });
    expect(red).toContain("AutoSelection.record(Alliance.RED, false);");
    expect(red).toContain("Drawn for the red alliance");
  });

  it.each(["java", "kotlin"] as const)(
    "a %s OpMode records it in init()",
    async (language) => {
      const code = await generateJavaCode(
        start,
        lines,
        true,
        sequence,
        "org.team",
        "Standard",
        "Pedro",
        "imperial",
        "Auto.turt",
        language,
        undefined,
        undefined,
        "RED",
      );
      expect(code).toContain("AutoSelection.record(Alliance.RED, false)");
      expect(code).toContain("import com.turtletracerlib.auto.AutoSelection");
      expect(code).not.toContain("AutoSelector");
      expect(code).not.toContain("ctx.");
      const init = code.slice(code.indexOf("init()"), code.indexOf("loop()"));
      expect(init).toContain("AutoSelection.record(Alliance.RED, false)");
    },
  );

  it("comes from the project in the registered exporters", async () => {
    const data = {
      startPoint: start,
      lines,
      sequence,
      shapes: [],
      extraData: withProjectAlliance({}, { drawnFor: "BLUE" }),
    };
    const seq = await get(exporterRegistry).sequential.exportCode(data, {
      fileName: "Auto",
      hardcodeValues: true,
    });
    expect(seq).toContain("AutoSelection.record(Alliance.BLUE, false);");
    const op = await get(exporterRegistry).java.exportCode(data, {
      fileName: "Auto",
    });
    expect(op).toContain("AutoSelection.record(Alliance.BLUE, false);");

    const none = await get(exporterRegistry).java.exportCode(
      { ...data, extraData: {} },
      { fileName: "Auto" },
    );
    expect(none).not.toContain("AutoSelection");
  });
});

describe("@TurtleAuto on exported classes", () => {
  const plainLines = lines.map(({ eventMarkers: _markers, ...line }) => line);
  const plainSequence: SequenceItem[] = [
    { kind: "path", lineId: "a" },
    { kind: "path", lineId: "b" },
  ];
  const exportWith = (o: {
    library?: CommandLibraryId;
    language?: CodeLanguage;
    hardcode?: boolean;
    markers?: boolean;
    alliance?: { drawnFor: DrawnFor; mirror: boolean };
    fileName?: string;
  }) =>
    generateSequentialCommandCode(
      start,
      o.markers ? lines : plainLines,
      o.fileName ?? "2 Score.turt",
      o.markers ? sequence : plainSequence,
      o.library ?? "SolversLib",
      "org.team",
      o.hardcode ?? true,
      "Pedro",
      "imperial",
      o.language ?? "java",
      o.alliance,
    );

  it("isn't written for a class that doesn't use TurtleTracerLib, so it can't break the build", async () => {
    const code = await exportWith({});
    expect(code).not.toContain("TurtleAuto");
  });

  it.each([
    ["an alliance", { alliance: { drawnFor: "BLUE", mirror: false } as const }],
    ["mirroring", { alliance: { drawnFor: "BLUE", mirror: true } as const }],
    ["event markers", { markers: true }],
    ["poses read from the file", { hardcode: false }],
  ])("is written for a class that already uses it for %s", async (_why, o) => {
    const code = await exportWith(o);
    expect(code).toContain("import com.turtletracerlib.auto.TurtleAuto;");
    expect(code).toMatch(
      /@TurtleAuto\(name = "2 Score"(, drawnFor = Alliance\.BLUE, mirror = MirrorPolicy\.(FOLLOW_ALLIANCE|NEVER), overrideMirror = true)?\)\npublic class/,
    );
  });

  it("names the alliance the project is drawn for", async () => {
    const code = await exportWith({
      alliance: { drawnFor: "RED", mirror: true },
    });
    expect(code).toContain(
      '@TurtleAuto(name = "2 Score", drawnFor = Alliance.RED, mirror = MirrorPolicy.FOLLOW_ALLIANCE, overrideMirror = true)',
    );
  });

  it("tells the selector an auto that doesn't mirror never does", async () => {
    const code = await exportWith({
      alliance: { drawnFor: "RED", mirror: false },
    });
    expect(code).toContain(
      '@TurtleAuto(name = "2 Score", drawnFor = Alliance.RED, mirror = MirrorPolicy.NEVER, overrideMirror = true)',
    );
    expect(code).toContain("import com.turtletracerlib.auto.MirrorPolicy;");
    expect(code).toContain("AutoSelection.record(Alliance.RED, false);");
  });

  it("states the policy in the OpMode's alliance menu too", async () => {
    const code = await generateJavaCode(
      start,
      lines,
      true,
      sequence,
      "org.team",
      "Standard",
      "Pedro",
      "imperial",
      "Auto.turt",
      "java",
      undefined,
      { drawnFor: "BLUE", axes: "BOTH" },
    );
    expect(code).toContain(".mirrorPolicy(MirrorPolicy.FOLLOW_ALLIANCE)");
    expect(code).toContain("import com.turtletracerlib.auto.MirrorPolicy;");
  });

  it("is written for NextFTC and Kotlin too", async () => {
    const alliance = { drawnFor: "BLUE", mirror: false } as const;
    expect(await exportWith({ library: "NextFTC", alliance })).toMatch(
      /@TurtleAuto\([^)]*\)\npublic class/,
    );
    const kotlin = await exportWith({ language: "kotlin", alliance });
    expect(kotlin).toContain("import com.turtletracerlib.auto.TurtleAuto\n");
    expect(kotlin).toMatch(/@TurtleAuto\([^)]*\)\nclass /);
  });

  it("isn't written for Ivy, whose class isn't a Command scan could offer", async () => {
    const code = await exportWith({
      library: "Ivy",
      alliance: { drawnFor: "BLUE", mirror: true },
    });
    expect(code).not.toContain("TurtleAuto");
  });

  it("keeps the name a valid string", async () => {
    const alliance = { drawnFor: "BLUE", mirror: false } as const;
    const java = await exportWith({ alliance, fileName: 'Say "hi" $1.turt' });
    expect(java).toContain('@TurtleAuto(name = "Say hi $1"');
    const kotlin = await exportWith({
      alliance,
      fileName: 'Say "hi" $1.turt',
      language: "kotlin",
    });
    expect(kotlin).toContain(String.raw`@TurtleAuto(name = "Say hi \$1"`);
  });
});
