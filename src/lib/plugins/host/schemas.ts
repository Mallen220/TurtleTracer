// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Checks for everything a plugin sends the app. A plugin's frame can post
// anything, so nothing from it is used until it has passed one of these.
// Objects are parsed into fresh ones with only the known keys, which also
// stops `__proto__` tricks. Sizes are capped so a plugin can't flood the UI.
import { z } from "zod";
import type {
  EditOp,
  FieldPrimitive,
  FormField,
  JsonValue,
  PoseTrack,
} from "../api";

const finite = z.number().finite();
const text = (max: number) => z.string().max(max);
const name = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, {
  message: "use lower-case letters, digits and dashes",
});
const color = text(64);
const svg = text(20_000);

// --- Messages ---

export const messageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("call"),
    id: z.number().int(),
    method: text(64),
    args: z.array(z.unknown()).max(16),
  }),
  z.object({
    type: z.literal("result"),
    id: z.number().int(),
    ok: z.boolean(),
    value: z.unknown().optional(),
    error: text(4000).optional(),
  }),
  z.object({
    type: z.literal("notify"),
    method: text(64),
    args: z.array(z.unknown()).max(16),
  }),
]);

// --- Plain data ---

/** JSON values, nested at most 32 deep. */
export const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(100_000),
    finite,
    z.boolean(),
    z.null(),
    z.array(jsonSchema).max(10_000),
    z.record(z.string().max(200), jsonSchema),
  ]),
);

export const pointSchema = z.object({ x: finite, y: finite });

/** Up to `maxSamples` poses with times that never go backwards. */
export const poseTrackSchema = (maxSamples = 200_000) =>
  z
    .object({
      t: z.array(finite).max(maxSamples),
      x: z.array(finite).max(maxSamples),
      y: z.array(finite).max(maxSamples),
      heading: z.array(finite).max(maxSamples),
    })
    .refine(
      (track) =>
        track.x.length === track.t.length &&
        track.y.length === track.t.length &&
        track.heading.length === track.t.length,
      "t, x, y and heading must be the same length",
    )
    .refine(
      (track) => track.t.every((t, i) => i === 0 || t >= track.t[i - 1]),
      "times must not go backwards",
    ) satisfies z.ZodType<PoseTrack>;

// --- Forms ---

const fieldBase = {
  key: z.string().regex(/^[A-Za-z_][\w-]{0,63}$/),
  label: text(80),
  help: text(300).optional(),
};

export const formFieldSchema = z.discriminatedUnion("type", [
  z.object({
    ...fieldBase,
    type: z.literal("number"),
    default: finite.optional(),
    min: finite.optional(),
    max: finite.optional(),
    step: finite.positive().optional(),
    unit: z.enum(["distance", "angle", "time", "speed"]).optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("text"),
    default: text(10_000).optional(),
    placeholder: text(120).optional(),
    multiline: z.boolean().optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("toggle"),
    default: z.boolean().optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("select"),
    options: z
      .array(z.object({ value: text(200), label: text(120) }))
      .min(1)
      .max(200),
    default: text(200).optional(),
  }),
  z.object({
    ...fieldBase,
    type: z.literal("color"),
    default: color.optional(),
  }),
]) satisfies z.ZodType<FormField>;

export const formFieldsSchema = z
  .array(formFieldSchema)
  .max(64)
  .refine(
    (fields) => new Set(fields.map((f) => f.key)).size === fields.length,
    "two fields have the same key",
  );

export const formValuesSchema = z.record(
  z.string().max(64),
  z.union([text(10_000), finite, z.boolean()]),
);

// --- Field drawings ---

const primitiveBase = {
  id: text(200).optional(),
  opacity: z.number().min(0).max(1).optional(),
  space: z.enum(["field", "robot"]).optional(),
};
const paint = {
  fill: color.optional(),
  stroke: color.optional(),
  strokeWidth: z.number().min(0).max(100).optional(),
};
const size = z.number().min(0).max(10_000);

export const primitiveSchema = z.discriminatedUnion("type", [
  z.object({
    ...primitiveBase,
    ...paint,
    type: z.literal("circle"),
    x: finite,
    y: finite,
    radius: size,
  }),
  z.object({
    ...primitiveBase,
    ...paint,
    type: z.literal("rect"),
    x: finite,
    y: finite,
    width: size,
    height: size,
    rotation: finite.optional(),
  }),
  z.object({
    ...primitiveBase,
    ...paint,
    type: z.literal("line"),
    points: z.array(pointSchema).max(10_000),
    closed: z.boolean().optional(),
    dash: z.array(z.number().min(0).max(1000)).max(8).optional(),
  }),
  z.object({
    ...primitiveBase,
    type: z.literal("text"),
    x: finite,
    y: finite,
    text: text(500),
    size: z.number().min(0).max(100).optional(),
    color: color.optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    bold: z.boolean().optional(),
  }),
  z.object({
    ...primitiveBase,
    type: z.literal("arrow"),
    from: pointSchema,
    to: pointSchema,
    color: color.optional(),
    strokeWidth: z.number().min(0).max(100).optional(),
  }),
  z.object({
    ...primitiveBase,
    type: z.literal("robot"),
    x: finite.optional(),
    y: finite.optional(),
    heading: finite.optional(),
    track: text(100).optional(),
    color: color.optional(),
    length: size.optional(),
    width: size.optional(),
  }),
]) satisfies z.ZodType<FieldPrimitive>;

/** What one layer may draw at once. */
export const MAX_PRIMITIVES = 5000;
export const primitivesSchema = z.array(primitiveSchema).max(MAX_PRIMITIVES);

// --- Contributions ---

export const commandSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][\w.-]{0,63}$/),
  label: text(80).min(1),
});

export const navbarButtonSchema = z.object({
  command: text(64),
  icon: svg,
  title: text(80).optional(),
});

export const contextMenuItemSchema = z.object({
  command: text(64),
  label: text(80).optional(),
  icon: svg.optional(),
});

export const layerSchema = z.object({
  redrawOn: z
    .object({
      project: z.boolean().optional(),
      playback: z.boolean().optional(),
    })
    .optional(),
});

export const actionSchema = z.object({
  name,
  label: text(40).min(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "use a hex colour like #22c55e")
    .optional(),
  icon: svg.optional(),
  fields: formFieldsSchema.optional(),
  timing: z
    .union([
      z.object({ seconds: z.number().min(0).max(3600) }),
      z.object({ secondsFrom: text(64) }),
    ])
    .optional(),
});

export const markerSchema = z.object({
  name,
  label: text(40).min(1),
  fields: formFieldsSchema.optional(),
});

export const exporterSchema = z.object({
  name,
  label: text(60).min(1),
  extension: z
    .string()
    .regex(/^[A-Za-z0-9]{1,10}$/)
    .optional(),
  language: z.enum(["java", "json", "plaintext"]).optional(),
});

export const simulatorSchema = z.object({
  name,
  label: text(60).min(1),
});

// --- Answers from plugin callbacks ---

export const actionTimingSchema = z.object({
  seconds: z.number().min(0).max(3600),
  endHeading: finite.optional(),
  poses: poseTrackSchema(50_000).optional(),
});

export const javaCodeSchema = z.object({
  code: text(200_000),
  states: z.number().int().min(0).max(1000),
});

export const simulationSchema = z.object({
  poses: poseTrackSchema(),
  notes: z
    .array(
      z.object({
        time: finite,
        text: text(300),
        level: z.enum(["info", "warning"]).optional(),
      }),
    )
    .max(200)
    .optional(),
});

export const codeSchema = text(2_000_000);

// --- Calls from plugins ---

export const confirmOptionsSchema = z.object({
  title: text(120),
  message: text(2000),
  confirmLabel: text(40).optional(),
  cancelLabel: text(40).optional(),
});

export const promptOptionsSchema = z.object({
  title: text(120),
  message: text(2000).optional(),
  defaultValue: text(10_000).optional(),
  placeholder: text(120).optional(),
});

export const formOptionsSchema = z.object({
  title: text(120),
  fields: formFieldsSchema,
  values: formValuesSchema.optional(),
  submitLabel: text(40).optional(),
});

const newStepSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plugin"),
    type: text(120),
    name: text(120).optional(),
    data: z.record(text(64), jsonSchema).optional(),
  }),
  z.object({
    kind: z.literal("wait"),
    name: text(120).optional(),
    durationMs: z.number().min(0).max(3_600_000),
  }),
  z.object({
    kind: z.literal("rotate"),
    name: text(120).optional(),
    degrees: finite,
  }),
]);

const vertices = z.array(pointSchema).min(3).max(1000);

export const editOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("insertStep"),
    index: z.number().int().min(0),
    step: newStepSchema,
  }),
  z.object({
    op: z.literal("updateStep"),
    id: text(200),
    changes: z.object({
      name: text(120).optional(),
      data: z.record(text(64), jsonSchema).optional(),
      durationMs: z.number().min(0).max(3_600_000).optional(),
      degrees: finite.optional(),
    }),
  }),
  z.object({ op: z.literal("removeStep"), id: text(200) }),
  z.object({
    op: z.literal("addPath"),
    to: pointSchema,
    controlPoints: z.array(pointSchema).max(50).optional(),
    name: text(120).optional(),
    color: color.optional(),
    index: z.number().int().min(0).optional(),
  }),
  z.object({ op: z.literal("removePath"), id: text(200) }),
  z.object({
    op: z.literal("movePoint"),
    pathId: text(200),
    point: z.union([z.literal("end"), z.number().int().min(0)]),
    x: finite,
    y: finite,
  }),
  z.object({ op: z.literal("moveStart"), x: finite, y: finite }),
  z.object({
    op: z.literal("addShape"),
    vertices,
    name: text(120).optional(),
    kind: z.enum(["obstacle", "keep-in"]).optional(),
    color: color.optional(),
  }),
  z.object({
    op: z.literal("updateShape"),
    id: text(200),
    changes: z.object({
      vertices: vertices.optional(),
      name: text(120).optional(),
      color: color.optional(),
    }),
  }),
  z.object({ op: z.literal("removeShape"), id: text(200) }),
]) satisfies z.ZodType<EditOp>;

export const editOpsSchema = z.array(editOpSchema).max(1000);

export const pickedProjectSchema = z.object({
  name: text(260),
  contents: jsonSchema,
});

/** Parses `value`, or throws an error that says what was wrong. */
export function check<T>(
  schema: z.ZodType<T>,
  value: unknown,
  what: string,
): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
  throw new Error(`Invalid ${what}${where}: ${issue?.message ?? "bad value"}`);
}
