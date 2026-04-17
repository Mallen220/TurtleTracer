import type { SequenceItem, Line, Point } from "../../types";
import { analyzePathSegment } from "./segmentAnalysis";

export function calculateGlobalChainMeta(
  seq: SequenceItem[],
  lines: Line[],
  startPoint: Point,
) {
  const lineById = new Map<string, Line>();
  lines.forEach((ln) => {
    if (!ln.id) ln.id = `line-${Math.random().toString(36).slice(2)}`;
    lineById.set(ln.id, ln);
  });

  const meta = new Map<
    string,
    {
      rootLine: Line;
      chainTotalLength: number;
      distanceBefore: number;
    }
  >();

  let tempLastPoint = startPoint;
  let currentChainLength = 0;
  let currentRootLine: Line | null = null;

  seq.forEach((item, idx) => {
    if (item.kind !== "path") return;
    const line = lineById.get((item as any).lineId);
    if (!line?.endPoint) return;

    const prevItem = idx > 0 ? seq[idx - 1] : null;
    const isChained = !!(
      prevItem?.kind === "path" &&
      ((item as any).isChain === true || line.isChain === true)
    );

    const analysis = analyzePathSegment(
      tempLastPoint,
      line.controlPoints as any,
      line.endPoint as any,
      50,
      0,
    );

    if (!isChained) {
      currentRootLine = line;
      currentChainLength = 0;
    }

    if (currentRootLine) {
      meta.set(line.id!, {
        rootLine: currentRootLine,
        chainTotalLength: 0,
        distanceBefore: currentChainLength,
      });
      currentChainLength += analysis.length;
      for (const m of meta.values()) {
        if (m.rootLine === currentRootLine) {
          m.chainTotalLength = currentChainLength;
        }
      }
    }
    tempLastPoint = line.endPoint;
  });

  return meta;
}
