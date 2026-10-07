// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  Point,
  Line,
  SequenceItem,
  TurtleData,
  CommandLibraryId,
} from "../../types";
import {
  chainHasEventMarkers,
  chainMarkerRegistrationCode,
  getUniqueEventMarkerNames,
} from "./eventMarkerUtils";
import { actionRegistry } from "../../lib/actionRegistry";
import { type CoordinateSystem } from "../../utils/coordinates";
import {
  DEFAULT_PROJECT_EXTENSION,
  getProjectExtensionFromPath,
  stripProjectExtension,
} from "../../utils/fileExtensions";
import { exporterRegistry } from "./index";
import { getCommandLibrary } from "./commandLibraries";
import { buildPoseTable, poseNameOf } from "./poseTable";
import {
  javaLength,
  formatJava,
  flattenMacros,
  AUTO_GENERATED_FILE_WARNING_MESSAGE,
  poseCode,
  angleCode,
  headingMethodCode,
  chainGlobalHeading,
  groupChains,
  uniqueNames,
  type FormatOptions,
  type HeadingConfig,
} from "./javaFormat";

export async function generateSequentialCommandCode(
  startPoint: Point,
  lines: Line[],
  fileName: string | null = null,
  sequence?: SequenceItem[],
  targetLibrary: CommandLibraryId = "SolversLib",
  packageName: string = "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
  hardcodeValues: boolean = false,
  coordinateSystem: CoordinateSystem = "Pedro",
  codeUnits: "imperial" | "metric" = "imperial",
): Promise<string> {
  const baseName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
  const className =
    stripProjectExtension(baseName).replaceAll(/[^a-zA-Z0-9]/g, "_") ||
    "AutoPath";

  // Every pose becomes a field. With hardcodeValues it's set from the
  // project's numbers; otherwise it's loaded at runtime with pp.get().
  const poseDeclarations: string[] = [];
  const poseInitializations: string[] = [];
  const opts: FormatOptions = { coordinateSystem, codeUnits };
  const poseName = (idx: number) => poseNameOf(lines, idx);

  for (const { name, x, y, degrees } of buildPoseTable(
    startPoint,
    lines,
    sequence,
  )) {
    let value: string;
    if (!hardcodeValues) {
      value = `pp.get("${name}")`;
    } else if (degrees === undefined) {
      value = `p.of(${x.toFixed(3)}, ${y.toFixed(3)}, 0.0)`;
    } else if (coordinateSystem === "FTC") {
      value = poseCode({ x, y }, opts, degrees);
    } else {
      value = `p.of(${javaLength(x, codeUnits)}, ${javaLength(y, codeUnits)}, ${degrees})`;
    }
    poseDeclarations.push(`    private Pose ${name};`);
    poseInitializations.push(`        ${name} = ${value};`);
  }

  // Paths are named after their start and end poses, e.g. startPointTOShoot.
  const pathChainVariables = uniqueNames(
    lines.map((_, idx) => `${poseName(idx - 1)}TO${poseName(idx)}`),
  );
  // A chained line is part of the path before it, so it has no variable.
  const pathChainDeclarations = lines
    .map((line, idx) =>
      line.isChain ? "" : `    private Path ${pathChainVariables[idx]};`,
    )
    .filter(Boolean)
    .join("\n");

  const library = getCommandLibrary(targetLibrary);

  // Generate addCommands calls with event handling; iterate sequence if provided
  const commands: string[] = [];

  const defaultSequence: SequenceItem[] = lines.map((ln, idx) => ({
    kind: "path",
    lineId: ln.id || `line-${idx + 1}`,
  }));

  const seq = flattenMacros(sequence?.length ? sequence : defaultSequence);

  seq.forEach((item) => {
    // Registry Check
    const action = actionRegistry.get(item.kind);
    if (action?.toSequentialCommand) {
      commands.push(
        action.toSequentialCommand(item, {
          targetLibrary: library.id,
          isNextFTC: library.id === "NextFTC",
        }),
      );
      return;
    }

    const lineIdx = lines.findIndex((l) => l.id === (item as any).lineId);
    if (lineIdx < 0) {
      return; // skip if sequence references a missing line
    }
    const line = lines[lineIdx];
    if (!line) {
      return;
    }

    // Skip generating an individual FollowPath command if this line is part of a chained group (but not the first)
    if (line.isChain) {
      return;
    }

    // The name of the entire Path is the pathName of the root path
    const pathName = pathChainVariables[lineIdx];

    const followPathInstance = library.commands.followPath(pathName);

    if (!chainHasEventMarkers(lines, lineIdx)) {
      commands.push(`                ${followPathInstance}`);
      return;
    }

    // The tracker only watches one path at a time: give it this path's
    // markers, then keep it updating for as long as the path is followed.
    const registrations = chainMarkerRegistrationCode(lines, lineIdx, {
      indent: "                        ",
      coordinateSystem,
      codeUnits,
      fromReader: !hardcodeValues,
    });
    commands.push(
      `                ${library.commands.instant(`{
                        tracker.clearPathEvents();${registrations}
                        tracker.setCurrentPath(${pathName});
                    }`)}`,
      `                ${library.commands.race(`
                    ${followPathInstance},
                    ${library.commands.perpetual("tracker.update()")}
                `)}`,
    );
  });

  // Interpolator arguments for a path between two pose variables. Unless
  // values are hardcoded, headings that weren't set explicitly are read
  // from the poses loaded at runtime.
  const interpolatorArgsFor =
    (startPose: string, endPose: string) =>
    (h: HeadingConfig): string => {
      switch (h.heading) {
        case "constant":
          return hardcodeValues || h.degrees !== undefined
            ? angleCode(h.degrees || 0, opts)
            : `${endPose}.heading()`;
        case "linear":
          return hardcodeValues ||
            (h.startDeg !== undefined && h.endDeg !== undefined)
            ? `${angleCode(h.startDeg || 0, opts)}, ${angleCode(h.endDeg || 0, opts)}`
            : `${startPose}.heading(), ${endPose}.heading()`;
        case "facingPoint":
          return poseCode({ x: h.targetX || 0, y: h.targetY || 0 }, opts);
        default:
          return "";
      }
    };

  const pathData = lines.map((line, idx) => {
    const startPose = poseName(idx - 1);
    const endPose = poseName(idx);
    const args = interpolatorArgsFor(startPose, endPose);

    const controlPoints = line.controlPoints.map(
      (cp) => `p.of(${cp.x.toFixed(3)}, ${cp.y.toFixed(3)}, 0.0)`,
    );
    const call = controlPoints.length
      ? `curve(${startPose}, ${controlPoints.join(", ")}, ${endPose})`
      : `line(${startPose}, ${endPose})`;

    const global = chainGlobalHeading(lines, idx);
    return {
      name: pathChainVariables[idx],
      call,
      heading: global ? "" : headingMethodCode(line.endPoint, args),
      chainHeading:
        global && !line.isChain
          ? `\n            ${headingMethodCode(global, args)}`
          : "",
    };
  });

  const pathBuilders = groupChains(lines, pathData)
    .map((members) => {
      const root = members[0];
      if (members.length === 1) {
        const heading = root.heading ? `\n            ${root.heading}` : "";
        return `        ${root.name} = ${root.call}${heading};`;
      }
      const calls = members.map((m) => {
        const heading = m.heading ? `\n                ${m.heading}` : "";
        return `            ${m.call}${heading}`;
      });
      return `        ${root.name} = path(\n${calls.join(",\n")}\n        )${root.chainHeading};`;
    })
    .join("\n\n");

  const ppReaderImport = hardcodeValues
    ? ""
    : "import com.turtletracerlib.TurtleTracerReader;";
  // Paths with markers read them from the file when they start, which for
  // some libraries is outside the constructor, so the reader has to be a field.
  const readerIsField =
    !hardcodeValues &&
    lines.some((line) => line.eventMarkers && line.eventMarkers.length > 0);
  const ppReaderInit = hardcodeValues
    ? ""
    : (() => {
        const rawName = fileName ? fileName.split(/[\\/]/).pop() || "" : "";
        const baseName =
          stripProjectExtension(rawName || "AutoPath") || "AutoPath";
        const ext =
          getProjectExtensionFromPath(rawName) || DEFAULT_PROJECT_EXTENSION;
        return `${readerIsField ? "" : "TurtleTracerReader "}pp = new TurtleTracerReader("${baseName}${ext}", hw.appContext);`;
      })();

  // Waits and turns can carry markers too, and need the tracker as well.
  const sequenceMarkers = seq.flatMap(
    (item) =>
      (item as { eventMarkers?: { name: string }[] }).eventMarkers ?? [],
  );
  const hasEventMarkers =
    lines.some((line) => line.eventMarkers && line.eventMarkers.length > 0) ||
    sequenceMarkers.length > 0;
  const markerNames = [
    ...new Set([
      ...getUniqueEventMarkerNames(lines),
      ...sequenceMarkers.map((m) => m.name).filter(Boolean),
    ]),
  ];

  const getEventBindingCode = () => {
    if (!hasEventMarkers) return "";
    const bindings =
      !hardcodeValues && markerNames.length > 0
        ? `\n        pp${markerNames.map((name) => `.onEvent("${name}", NamedCommands.getCommand("${name}"))`).join("\n          ")};\n`
        : "";
    // Each path registers its own markers just before it is followed.
    return `${bindings}
        tracker = new ProgressTracker(follower, ${library.trackerTelemetry});`;
  };

  const sequentialCommandCode = library.classTemplate({
    warning: AUTO_GENERATED_FILE_WARNING_MESSAGE,
    packageName,
    className,
    imports: library.imports,
    ppReaderImport,
    ppReaderInit,
    hasEventMarkers,
    trackerField:
      (readerIsField ? "\n    private TurtleTracerReader pp;" : "") +
      (hasEventMarkers ? "\n    private ProgressTracker tracker;" : ""),
    eventBindingCode: getEventBindingCode(),
    poseDeclarations: poseDeclarations.join("\n"),
    poseInitializations: poseInitializations.join("\n"),
    pathChainDeclarations,
    pathBuilders,
    commands: commands.join(",\n"),
    ftcPoseHelper:
      coordinateSystem === "FTC"
        ? `
    private Pose buildPose(double x, double y, double heading) {
        return p.of(y + 72.0, 72.0 - x, heading);
    }
    `
        : "",
    metricHelper:
      codeUnits === "metric"
        ? `
    private double cmToInches(double cm) {
        return cm / 2.54;
    }
`
        : "",
  });

  return formatJava(sequentialCommandCode);
}

exporterRegistry.register({
  id: "sequential",
  name: "Export Sequential Code",
  description: "Export the path as a Sequential Command group.",
  exportCode: async (data: TurtleData, settings: any) => {
    return await generateSequentialCommandCode(
      data.startPoint,
      data.lines,
      settings.fileName,
      data.sequence,
      settings.targetLibrary ?? "SolversLib",
      settings.packageName ??
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      settings.hardcodeValues ?? false,
      settings.coordinateSystem ?? "Pedro",
      settings.codeUnits ?? "imperial",
    );
  },
});
