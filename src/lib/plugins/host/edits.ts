// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Applies a plugin's `project.edit` operations (api/data.ts EditOp). Each
// one is checked against the plugin's permissions: a plugin may always
// change its own steps, and needs `project.write` for anything else. The
// whole batch is worked out on copies first, so a failing operation leaves
// the project untouched.
import type { EditOp, NewStep } from "../api";
import type {
  Line,
  Point,
  SequenceItem,
  SequencePluginItem,
  Shape,
} from "../../../types";
import { insertPath } from "../../actions/PathAction";
import { makeId } from "../../../utils/nameGenerator";

export interface EditableProject {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
}

export interface EditContext {
  pluginId: string;
  /** Whether the plugin has the `project.write` permission. */
  canWrite: boolean;
  /** The default data for a step of an action type, or null if there's no such type. */
  actionDefaults(type: string): Record<string, unknown> | null;
}

function isOwnStep(item: SequenceItem, pluginId: string): boolean {
  return item.kind === "plugin" && item.type.startsWith(`${pluginId}.`);
}

function requireWrite(ctx: EditContext, what: string) {
  if (!ctx.canWrite) {
    throw new Error(
      `${what} needs the "project.write" permission in plugin.json.`,
    );
  }
}

function stepIndex(project: EditableProject, id: string): number {
  const index = project.sequence.findIndex((item) =>
    item.kind === "path" ? item.lineId === id : item.id === id,
  );
  if (index === -1) throw new Error(`There's no step with id "${id}".`);
  return index;
}

function lineById(project: EditableProject, id: string): Line {
  const line = project.lines.find((l) => l.id === id);
  if (!line) throw new Error(`There's no path with id "${id}".`);
  if (line.locked) throw new Error(`The path "${line.name || id}" is locked.`);
  return line;
}

function shapeIndex(project: EditableProject, id: string): number {
  const index = project.shapes.findIndex((s) => s.id === id);
  if (index === -1) throw new Error(`There's no shape with id "${id}".`);
  return index;
}

function newStep(step: NewStep, ctx: EditContext): SequenceItem {
  if (step.kind === "plugin") {
    const type = step.type.includes(".")
      ? step.type
      : `${ctx.pluginId}.${step.type}`;
    if (!type.startsWith(`${ctx.pluginId}.`)) {
      requireWrite(ctx, "Adding another plugin's steps");
    }
    const defaults = ctx.actionDefaults(type);
    if (!defaults) throw new Error(`There's no action type "${type}".`);
    return {
      kind: "plugin",
      id: makeId(),
      type,
      name: step.name ?? "",
      data: { ...defaults, ...step.data },
    } satisfies SequencePluginItem;
  }
  requireWrite(ctx, `Adding a ${step.kind} step`);
  return step.kind === "wait"
    ? {
        kind: "wait",
        id: makeId(),
        name: step.name ?? "",
        durationMs: step.durationMs,
      }
    : {
        kind: "rotate",
        id: makeId(),
        name: step.name ?? "",
        degrees: step.degrees,
      };
}

function applyOne(project: EditableProject, op: EditOp, ctx: EditContext) {
  switch (op.op) {
    case "insertStep": {
      const index = Math.min(op.index, project.sequence.length);
      project.sequence.splice(index, 0, newStep(op.step, ctx));
      break;
    }
    case "updateStep": {
      const index = stepIndex(project, op.id);
      const item = project.sequence[index];
      if (!isOwnStep(item, ctx.pluginId))
        requireWrite(ctx, "Changing this step");
      const { name, data, durationMs, degrees } = op.changes;
      const updated = { ...item } as SequenceItem & Record<string, unknown>;
      if (name !== undefined && item.kind !== "path") updated.name = name;
      if (data !== undefined && item.kind === "plugin") {
        updated.data = { ...item.data, ...data };
      }
      if (durationMs !== undefined && item.kind === "wait") {
        updated.durationMs = durationMs;
      }
      if (degrees !== undefined && item.kind === "rotate") {
        updated.degrees = degrees;
      }
      project.sequence[index] = updated;
      break;
    }
    case "removeStep": {
      const index = stepIndex(project, op.id);
      const item = project.sequence[index];
      if (item.kind === "path") {
        applyOne(project, { op: "removePath", id: item.lineId }, ctx);
        break;
      }
      if (!isOwnStep(item, ctx.pluginId))
        requireWrite(ctx, "Removing this step");
      project.sequence.splice(index, 1);
      break;
    }
    case "addPath": {
      requireWrite(ctx, "Adding a path");
      const index = Math.min(
        op.index ?? project.sequence.length,
        project.sequence.length,
      );
      const before = new Set(project.lines.map((l) => l.id));
      insertPath(
        {
          index,
          sequence: project.sequence,
          lines: project.lines,
          startPoint: project.startPoint,
          triggerReactivity: () => {},
        },
        () => op.to,
      );
      const line = project.lines.find((l) => !before.has(l.id));
      if (line) {
        line.controlPoints = (op.controlPoints ?? []).map((p) => ({
          x: p.x,
          y: p.y,
        }));
        if (op.name !== undefined) line.name = op.name;
        if (op.color !== undefined) line.color = op.color;
      }
      break;
    }
    case "removePath": {
      requireWrite(ctx, "Removing a path");
      lineById(project, op.id);
      if (project.lines.length <= 1) {
        throw new Error("A project needs at least one path.");
      }
      project.lines = project.lines.filter((l) => l.id !== op.id);
      project.sequence = project.sequence.filter(
        (item) => item.kind !== "path" || item.lineId !== op.id,
      );
      break;
    }
    case "movePoint": {
      requireWrite(ctx, "Moving a point");
      const line = lineById(project, op.pathId);
      if (op.point === "end") {
        line.endPoint = { ...line.endPoint, x: op.x, y: op.y };
      } else {
        const cp = line.controlPoints[op.point];
        if (!cp) throw new Error(`The path has no control point ${op.point}.`);
        line.controlPoints[op.point] = { ...cp, x: op.x, y: op.y };
      }
      break;
    }
    case "moveStart": {
      requireWrite(ctx, "Moving the start point");
      project.startPoint = { ...project.startPoint, x: op.x, y: op.y };
      break;
    }
    case "addShape": {
      requireWrite(ctx, "Adding a shape");
      project.shapes.push({
        id: makeId("shape"),
        name: op.name ?? "",
        vertices: op.vertices.map((p) => ({ x: p.x, y: p.y })),
        color: op.color ?? "#dc2626",
        fillColor: op.color ?? "#fca5a5",
        locked: false,
        type: op.kind ?? "obstacle",
        visible: true,
      });
      break;
    }
    case "updateShape": {
      requireWrite(ctx, "Changing a shape");
      const index = shapeIndex(project, op.id);
      const shape = { ...project.shapes[index] };
      if (shape.locked)
        throw new Error(`The shape "${shape.name || op.id}" is locked.`);
      const { vertices, name, color } = op.changes;
      if (vertices) shape.vertices = vertices.map((p) => ({ x: p.x, y: p.y }));
      if (name !== undefined) shape.name = name;
      if (color !== undefined) shape.color = color;
      project.shapes[index] = shape;
      break;
    }
    case "removeShape": {
      requireWrite(ctx, "Removing a shape");
      project.shapes.splice(shapeIndex(project, op.id), 1);
      break;
    }
  }
}

/** Applies `ops` to a copy of `project` and returns the copy. Throws if any op fails. */
export function applyEdits(
  project: EditableProject,
  ops: EditOp[],
  ctx: EditContext,
): EditableProject {
  const copy: EditableProject = structuredClone({
    startPoint: project.startPoint,
    lines: project.lines,
    shapes: project.shapes,
    sequence: project.sequence,
  });
  for (const op of ops) applyOne(copy, op, ctx);
  return copy;
}
