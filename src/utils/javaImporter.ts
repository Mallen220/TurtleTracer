// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { parse } from "java-parser";
import type {
  TurtleData,
  Point,
  Line,
  SequenceItem,
  Shape,
  ControlPoint,
} from "../types";
// Helper to generate IDs
const generateId = () => `id_${Math.random().toString(36).slice(2, 11)}`;

const toDegrees = (rad: number) => (rad * 180) / Math.PI;

export function walkAST(
  node: any,
  visitors: Record<string, (node: any, context?: any) => void>,
  context: any = {},
) {
  if (!node || typeof node !== "object") return;

  if (node.name && visitors[node.name]) {
    visitors[node.name](node, context);
  }

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        child.forEach((c: any) => walkAST(c, visitors, context));
      } else {
        walkAST(child, visitors, context);
      }
    }
  }
}

export function extractTokens(node: any): string[] {
  const tokens: string[] = [];
  if (!node || typeof node !== "object") return tokens;

  if (node.image) {
    tokens.push(node.image);
  }

  if (node.children) {
    for (const key in node.children) {
      const child = node.children[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          tokens.push(...extractTokens(c));
        }
      } else {
        tokens.push(...extractTokens(child));
      }
    }
  }
  return tokens;
}

function parsePoseCreation(tokens: string[]): Partial<Point> | null {
  const argsStart = tokens.indexOf("(");
  // Find matching closing paren
  let argsEnd = -1;
  let depth = 0;
  for (let i = argsStart; i < tokens.length; i++) {
    if (tokens[i] === "(") depth++;
    if (tokens[i] === ")") depth--;
    if (depth === 0 && i > argsStart) {
      argsEnd = i;
      break;
    }
  }

  if (argsStart === -1 || argsEnd === -1) return null;

  const argsTokens = tokens.slice(argsStart + 1, argsEnd);

  // Group tokens by semantic boundaries. The Java Parser puts commas at the END of the parameter list often (due to AST structure)
  // Example tokens: [ '56.000', '8.000', 'Math', '.', 'toRadians', '(', '180.000', ')', ',', ',' ]
  const argGroups: string[][] = [];
  let currentGroup: string[] = [];
  let localDepth = 0;
  for (let i = 0; i < argsTokens.length; i++) {
    const t = argsTokens[i];
    if (t === "(") localDepth++;
    if (t === ")") localDepth--;

    // We can just ignore commas, and rely on number/Math parsing to group things
    if (t !== ",") {
      currentGroup.push(t);
    }
  }

  // Now process the single list of meaningful tokens
  const parsedArgs = [];
  for (let i = 0; i < currentGroup.length; i++) {
    const t = currentGroup[i];
    if (
      t === "Math" &&
      currentGroup[i + 1] === "." &&
      currentGroup[i + 2] === "toRadians"
    ) {
      const parenStart = currentGroup.indexOf("(", i);
      const parenEnd = currentGroup.indexOf(")", parenStart);
      if (parenStart !== -1 && parenEnd !== -1) {
        const numStr = currentGroup.slice(parenStart + 1, parenEnd).join("");
        const num = parseFloat(numStr);
        parsedArgs.push({ value: num, isRadians: true });
        i = parenEnd; // skip
      }
    } else {
      // Check if it's a number
      // Sometimes negative numbers are split: "-", "9.0"
      let numStr = t;
      let offset = 0;
      if (t === "-" && i + 1 < currentGroup.length) {
        numStr += currentGroup[i + 1];
        offset = 1;
      }
      if (!isNaN(parseFloat(numStr))) {
        parsedArgs.push({ value: parseFloat(numStr), isRadians: false });
        i += offset;
      } else if (/^[a-zA-Z_]\w*$/.test(t)) {
        parsedArgs.push({ value: t, isRadians: false, isIdentifier: true });
      }
    }
  }

  // If the args are just a single identifier (e.g., `new Point(startPose)`)
  // We can't fully parse it here without the `points` map.
  // We'll return it as a special case and let the caller resolve it.
  if (parsedArgs.length === 1 && parsedArgs[0].isIdentifier) {
    return { identifier: parsedArgs[0].value } as any;
  }

  const nums = parsedArgs.filter((a) => !a.isIdentifier).map((a) => a);

  if (nums.length >= 2) {
    const pt: Partial<Point> = {
      x: nums[0].value as number,
      y: nums[1].value as number,
    };
    if (nums.length >= 3) {
      const h = nums[2];
      pt.heading = "constant";
      pt.degrees = h.isRadians
        ? (h.value as number)
        : toDegrees(h.value as number);
    }
    return pt;
  }
  return null;
}

export function importJavaProject(javaCode: string): TurtleData {
  let ast;
  try {
    ast = parse(javaCode);
  } catch (e) {
    console.error("Failed to parse Java code:", e);
    return {
      startPoint: { x: 0, y: 0, heading: "linear", startDeg: 0, endDeg: 0 },
      lines: [],
      sequence: [],
      shapes: [],
    };
  }

  const points = new Map<string, Point>();
  let startPoint: Point | null = null;
  const lines: Line[] = [];
  const sequence: SequenceItem[] = [];
  const tempSequence: SequenceItem[] = [];
  const shapes: Shape[] = [];

  // Parse fields/variables
  walkAST(ast, {
    variableDeclarator: (node) => {
      const tokens = extractTokens(node);
      const name = tokens[0];
      const eqIdx = tokens.indexOf("=");
      if (eqIdx !== -1) {
        const valTokens = tokens.slice(eqIdx + 1);
        if (
          valTokens.includes("new") &&
          (valTokens.includes("Pose") || valTokens.includes("Point"))
        ) {
          const pt = parsePoseCreation(valTokens);
          if (pt) points.set(name, pt as Point);
        }
      }
    },
    statementExpression: (node) => {
      const tokens = extractTokens(node);
      // Look for: startPoint = pp.get("startPoint") or startPose = new Pose(...)
      const eqIdx = tokens.indexOf("=");
      if (eqIdx !== -1) {
        const name = tokens[0]; // simplistic but mostly works
        const valTokens = tokens.slice(eqIdx + 1);
        if (
          valTokens.includes("new") &&
          (valTokens.includes("Pose") || valTokens.includes("Point"))
        ) {
          const pt = parsePoseCreation(valTokens);
          if (pt) points.set(name, pt as Point);
        } else if (valTokens.includes("pp") && valTokens.includes("get")) {
          // Fallback for pp.get("name") - we can't get coords, just dummy
          points.set(name, {
            x: 0,
            y: 0,
            heading: "linear",
            startDeg: 0,
            endDeg: 0,
          });
        }
      }

      // Look for follower.setStartingPose(...)
      if (tokens.includes("setStartingPose")) {
        if (
          tokens.includes("new") &&
          (tokens.includes("Pose") || tokens.includes("Point"))
        ) {
          const pt = parsePoseCreation(tokens);
          if (pt) startPoint = { ...pt, locked: false } as Point;
        } else {
          const startParen = tokens.indexOf("(");
          if (startParen !== -1) {
            const varName = tokens[startParen + 1];
            if (points.has(varName)) {
              startPoint = { ...points.get(varName)!, locked: false } as Point;
            }
          }
        }
      }
    },
  });

  // Parse path constructions
  walkAST(ast, {
    statementExpression: (node) => {
      const tokens = extractTokens(node);

      if (
        (tokens.includes("pathBuilder") || tokens.includes("addPath")) &&
        tokens.includes("build")
      ) {
        const eqIdx = tokens.indexOf("=");
        const pathName = eqIdx !== -1 ? tokens[0] : `Path ${lines.length + 1}`;

        const pathTypeIdx = tokens.findIndex(
          (t) => t === "BezierLine" || t === "BezierCurve",
        );
        if (pathTypeIdx !== -1) {
          // Find the balanced parentheses for the Bezier function
          let argsStart = -1;
          for (let i = pathTypeIdx; i < tokens.length; i++) {
            if (tokens[i] === "(") {
              argsStart = i;
              break;
            }
          }

          if (argsStart === -1) return;

          let pcount = 0;
          let argsEnd = argsStart;
          for (let i = argsStart; i < tokens.length; i++) {
            if (tokens[i] === "(") pcount++;
            if (tokens[i] === ")") pcount--;
            if (pcount === 0) {
              argsEnd = i;
              break;
            }
          }

          const innerTokens = tokens.slice(argsStart + 1, argsEnd);

          // Split args
          // Wait, the commas might be at the end, due to how tokens are extracted (like Postorder).
          // But looking at the AST, the tokens might be grouped or commas might be just next to identifiers.
          // Let's just collect identifiers and 'new' poses
          // The Java parser token output puts identifiers next to each other and commas at the end.
          // For example: `[ 'startPoint', 'OuttakePreload', ',' ]` or `[ 'startPoint', 'OuttakePreload', ',', 'OuttakeThree', ',', ',' ]`
          // Let's filter out commas and just find valid point identifiers or new Poses
          const args: string[][] = [];
          let currentArgTokens: string[] = [];
          let inNewPose = false;
          for (let i = 0; i < innerTokens.length; i++) {
            const t = innerTokens[i];
            if (t === ",") continue;

            if (t === "new") {
              inNewPose = true;
              currentArgTokens.push(t);
            } else if (inNewPose) {
              currentArgTokens.push(t);
              // keep reading until closing paren for this pose
              // we'll count parens locally
              let pcount = 0;
              let startedParens = false;
              for (let j = i; j < innerTokens.length; j++) {
                const jt = innerTokens[j];
                if (jt === ",") continue;
                if (j !== i) currentArgTokens.push(jt);

                if (jt === "(") {
                  startedParens = true;
                  pcount++;
                }
                if (jt === ")") pcount--;
                if (startedParens && pcount === 0) {
                  args.push([...currentArgTokens]);
                  currentArgTokens = [];
                  inNewPose = false;
                  i = j;
                  break;
                }
              }
            } else {
              // just an identifier
              args.push([t]);
            }
          }

          const pathPoints: Point[] = [];

          for (const argToks of args) {
            if (
              argToks.includes("new") &&
              (argToks.includes("Pose") || argToks.includes("Point"))
            ) {
              const pt = parsePoseCreation(argToks);
              if (pt) {
                if ((pt as any).identifier) {
                  const ref = points.get((pt as any).identifier);
                  if (ref) pathPoints.push({ ...ref });
                  else pathPoints.push({ x: 0, y: 0 } as Point);
                } else {
                  pathPoints.push(pt as Point);
                }
              } else {
                pathPoints.push({ x: 0, y: 0 } as Point);
              }
            } else {
              const name = argToks.find(
                (t) =>
                  t !== "new" &&
                  t !== "Pose" &&
                  t !== "Point" &&
                  /^[a-zA-Z_]\w*$/.test(t),
              );
              if (name && points.has(name)) {
                pathPoints.push(points.get(name)!);
              } else if (name) {
                pathPoints.push({ x: 0, y: 0 } as Point); // Unknown point
              }
            }
          }

          if (pathPoints.length >= 2) {
            const startPt = pathPoints[0];
            const endPt = pathPoints[pathPoints.length - 1];
            const controlPts: ControlPoint[] = pathPoints
              .slice(1, -1)
              .map((p) => ({ x: p.x, y: p.y }));

            const lineId = generateId();
            const line: Line = {
              id: lineId,
              name: pathName,
              startPoint: startPt,
              endPoint: { ...endPt }, // Clone to allow modifying heading just for this line
              controlPoints: controlPts,
              color: "#FF0000",
              eventMarkers: [],
            };

            if (tokens.includes("setLinearHeadingInterpolation")) {
              line.endPoint.heading = "linear";
              const hIdx = tokens.indexOf("setLinearHeadingInterpolation");
              const argsTokens = tokens.slice(hIdx);
              const extracted = parsePoseCreation(argsTokens);

              if (extracted && (extracted as any).x !== undefined) {
                (line.endPoint as any).startDeg = extracted.x;
                (line.endPoint as any).endDeg = extracted.y;
              } else {
                (line.endPoint as any).startDeg = 0;
                (line.endPoint as any).endDeg = 0;
              }
            } else if (tokens.includes("setTangentHeadingInterpolation")) {
              line.endPoint.heading = "tangential";
            } else if (tokens.includes("setConstantHeadingInterpolation")) {
              line.endPoint.heading = "constant";
              const hIdx = tokens.indexOf("setConstantHeadingInterpolation");
              const argsTokens = tokens.slice(hIdx);
              const extracted = parsePoseCreation(argsTokens);

              if (extracted && (extracted as any).x !== undefined) {
                (line.endPoint as any).degrees = extracted.x;
              } else {
                (line.endPoint as any).degrees = 0;
              }
            } else if (tokens.includes("facingPoint")) {
              line.endPoint.heading = "facingPoint";
              const hIdx = tokens.indexOf("facingPoint");
              const argsTokens = tokens.slice(hIdx);
              const extracted = parsePoseCreation(argsTokens);

              if (extracted && (extracted as any).x !== undefined) {
                (line.endPoint as any).targetX = extracted.x;
                (line.endPoint as any).targetY = extracted.y;
              } else {
                (line.endPoint as any).targetX = 0;
                (line.endPoint as any).targetY = 0;
              }
            }

            // Find event markers
            const markerIndices = [];
            for (let i = 0; i < tokens.length; i++) {
              if (tokens[i] === "addEventMarker") markerIndices.push(i);
            }

            markerIndices.forEach((idx) => {
              const tStart = tokens.indexOf("(", idx);
              if (tStart === -1) return;

              let pcount = 0;
              let tEnd = tStart;
              for (let i = tStart; i < tokens.length; i++) {
                if (tokens[i] === "(") pcount++;
                if (tokens[i] === ")") pcount--;
                if (pcount === 0 && i > tStart) {
                  tEnd = i;
                  break;
                }
              }

              const mToks = tokens.slice(tStart + 1, tEnd);
              // mToks should look like [ '1.000', '"ShootCenter"', ',' ] or similar
              const numStr = mToks.find((t) => !isNaN(parseFloat(t)));
              const strTok = mToks.find((t) => t.includes('"'));

              if (numStr && strTok) {
                line.eventMarkers!.push({
                  id: generateId(),
                  name: strTok.replace(/"/g, ""),
                  position: parseFloat(numStr),
                });
              }
            });

            lines.push(line);

            const isReversed = tokens.includes("setReversed");
            sequence.push({
              kind: "path",
              lineId: lineId,
              reversed: isReversed,
            } as any);
          }
        }
      }
    },
  });

  walkAST(ast, {
    // We look for any context where a wait/rotate might be wrapped into the commands block.
    unqualifiedClassInstanceCreationExpression: (node, ctx) => {
      const tokens = extractTokens(node);
      if (
        tokens[0] === "new" &&
        (tokens[1] === "WaitCommand" || tokens[1] === "Delay")
      ) {
        // If we've already processed this exact node logic, skip.
        const waitIdx = 1;
        const parenStart = tokens.indexOf("(", waitIdx);
        const parenEnd = tokens.indexOf(")", parenStart);
        if (parenStart !== -1 && parenEnd !== -1) {
          const timeStr = tokens.slice(parenStart + 1, parenEnd).join("");
          if (!isNaN(parseFloat(timeStr))) {
            let time = parseFloat(timeStr);
            if (tokens[1] === "Delay") time *= 1000;
            tempSequence.push({
              kind: "wait",
              durationMs: time,
              id: generateId(),
            } as any);
          }
        }
      } else if (
        tokens[0] === "new" &&
        tokens[1] === "InstantCommand" &&
        tokens.includes("follower") &&
        tokens.includes("turnTo") &&
        !tokens.includes("WaitUntilCommand")
      ) {
        const turnIdx = tokens.indexOf("turnTo");
        const parenStart = tokens.indexOf("(", turnIdx);
        const parenEnd = tokens.indexOf(")", parenStart);
        if (parenStart !== -1 && parenEnd !== -1) {
          const innerTokens = tokens.slice(parenStart + 1, parenEnd);
          const pt = parsePoseCreation(innerTokens);
          let targetHeading = 0;
          if (pt && (pt as any).x !== undefined) targetHeading = (pt as any).x;
          else if (!isNaN(parseFloat(innerTokens.join(""))))
            targetHeading = toDegrees(parseFloat(innerTokens.join("")));

          tempSequence.push({
            kind: "rotate",
            degrees: targetHeading,
            id: generateId(),
            name: "Rotate",
          } as any);
          ctx.justProcessedRotate = targetHeading; // Set context flag to avoid inner lambda processing it again
        }
      }
    },
    lambdaExpression: (node, ctx) => {
      const tokens = extractTokens(node);

      if (
        tokens.includes("follower") &&
        tokens.includes("turnTo") &&
        !tokens.includes("WaitUntilCommand") &&
        tokens[0] === "(" &&
        tokens[2] === "->"
      ) {
        const turnIdx = tokens.indexOf("turnTo");
        if (tokens[turnIdx - 1] === "!") return;

        const parenStart = tokens.indexOf("(", turnIdx);
        const parenEnd = tokens.indexOf(")", parenStart);
        if (parenStart !== -1 && parenEnd !== -1) {
          const innerTokens = tokens.slice(parenStart + 1, parenEnd);
          const pt = parsePoseCreation(innerTokens);
          let targetHeading = 0;
          if (pt && (pt as any).x !== undefined) targetHeading = (pt as any).x;
          else if (!isNaN(parseFloat(innerTokens.join(""))))
            targetHeading = toDegrees(parseFloat(innerTokens.join("")));

          // If the outer InstantCommand just processed this exact rotation, skip it
          if (ctx.justProcessedRotate === targetHeading) {
            ctx.justProcessedRotate = undefined; // clear flag
            return;
          }
          tempSequence.push({
            kind: "rotate",
            degrees: targetHeading,
            id: generateId(),
            name: "Rotate",
          } as any);
        }
      }
    },
  });

  sequence.push(...tempSequence);

  if (!startPoint) {
    if (lines.length > 0 && lines[0].startPoint) {
      startPoint = { ...lines[0].startPoint };
    } else {
      startPoint = {
        x: 0,
        y: 0,
        heading: "linear",
        startDeg: 0,
        endDeg: 0,
      } as Point;
    }
  }

  // Ensure heading is set
  if (!startPoint.heading) {
    (startPoint as any).heading = "linear";
    (startPoint as any).startDeg = 0;
    (startPoint as any).endDeg = 0;
  }

  return {
    startPoint,
    lines,
    sequence,
    shapes,
  };
}
