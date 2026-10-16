// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Action types: new kinds of step (api/turtle.ts ActionTypeDefinition).
// Each becomes an ordinary ActionDefinition, so the sequence, the timeline
// and the exporters handle plugin steps the way they handle waits.
//
// The timeline is worked out synchronously, but a plugin answers
// asynchronously. Declarative timing (`timing`) needs no answer. A `time`
// callback's answers are kept per step; until a new one arrives the last
// answer stands in, and when it arrives the timeline is worked out again.
import type { ActionTiming, FormValues, PluginStep } from "../../api";
import type {
  ActionDefinition,
  CodeExportContext,
  SequenceItem,
  SequencePluginItem,
  TimeCalculationContext,
  TimeCalculationResult,
  TimelineEvent,
} from "../../../../types";
import { actionRegistry } from "../../../actionRegistry";
import { defaultsFor, pluginStepBase } from "../../../actions/PluginStepAction";
import { libraryForContext } from "../../../exporters/commandLibraries";
import { timingRevisionStore } from "../../../projectStore";
import { makeId } from "../../../../utils/nameGenerator";
import { sanitizeSvg } from "../sanitize";
import {
  actionSchema,
  actionTimingSchema,
  check,
  codeSchema,
  javaCodeSchema,
} from "../schemas";
import type { ContributionFactory, PluginContext } from "./types";

const TIMING_TIMEOUT_MS = 2000;
const CODE_TIMEOUT_MS = 10_000;

const asStep = (item: SequencePluginItem): PluginStep => ({
  id: item.id,
  type: item.type,
  name: item.name,
  data: structuredClone(item.data) as FormValues,
});

/** A timeline event for a step that takes `timing`. */
function timedResult(
  item: SequencePluginItem,
  label: string,
  timing: ActionTiming,
  ctx: TimeCalculationContext,
): TimeCalculationResult {
  const { seconds, endHeading, poses } = timing;
  if (seconds <= 0) return { events: [], duration: 0, endHeading };

  const event: TimelineEvent = {
    type: "wait",
    name: item.name || label,
    duration: seconds,
    startTime: ctx.currentTime,
    endTime: ctx.currentTime + seconds,
    waitId: item.id,
    startHeading: ctx.currentHeading,
    targetHeading: endHeading ?? ctx.currentHeading,
    atPoint: ctx.lastPoint,
  };
  if (!poses || poses.t.length < 2) {
    return { events: [event], duration: seconds, endHeading };
  }

  // A step that moves the robot: follow its poses, and start the next step
  // where it ends.
  const last = poses.t.length - 1;
  event.trace = {
    time: poses.t,
    x: poses.x,
    y: poses.y,
    heading: poses.heading,
    speed: poses.t.map((t, i) =>
      i === 0
        ? 0
        : Math.hypot(poses.x[i] - poses.x[i - 1], poses.y[i] - poses.y[i - 1]) /
          Math.max(1e-6, t - poses.t[i - 1]),
    ),
  };
  event.targetHeading = poses.heading[last];
  return {
    events: [event],
    duration: seconds,
    endHeading: poses.heading[last],
    endPoint: {
      x: poses.x[last],
      y: poses.y[last],
      heading: "constant",
      degrees: poses.heading[last],
    },
  };
}

/** Timing from a plugin's `time` callback, kept per step. */
function callbackTiming(plugin: PluginContext, registrationId: string) {
  const answers = new Map<string, { key: string; timing: ActionTiming }>();
  const asking = new Set<string>();

  return (
    item: SequencePluginItem,
    ctx: TimeCalculationContext,
  ): ActionTiming => {
    const start = {
      x: ctx.lastPoint.x,
      y: ctx.lastPoint.y,
      heading: ctx.currentHeading,
    };
    const key = JSON.stringify([item.data, start]);
    const known = answers.get(item.id);
    const request = `${item.id}|${key}`;
    if (known?.key !== key && !asking.has(request)) {
      asking.add(request);
      plugin
        .invoke(
          registrationId,
          "time",
          [{ step: asStep(item), start, project: plugin.snapshot() }],
          TIMING_TIMEOUT_MS,
        )
        .then((answer) => {
          answers.set(item.id, {
            key,
            timing: check(actionTimingSchema, answer, "timing"),
          });
          timingRevisionStore.update((n) => n + 1);
        })
        .catch((error) => plugin.reportError(error))
        .finally(() => asking.delete(request));
    }
    return known?.timing ?? { seconds: 0 };
  };
}

export const actionFactory: ContributionFactory = (
  plugin,
  registrationId,
  definition,
  callbacks,
) => {
  const action = check(actionSchema, definition, "action type");
  const type = `${plugin.id}.${action.name}`;
  const fields = action.fields ?? [];
  const label = action.label;

  const askPlugin = callbacks.includes("time")
    ? callbackTiming(plugin, registrationId)
    : null;
  /** Seconds from `timing` in the definition, without asking the plugin. */
  const declaredSeconds = (item: SequencePluginItem) => {
    const timing = action.timing;
    if (timing && "seconds" in timing) return timing.seconds;
    if (timing && "secondsFrom" in timing) {
      const seconds = Number(item.data[timing.secondsFrom]);
      return Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    }
    return 0;
  };
  const timingOf = (item: SequencePluginItem, ctx: TimeCalculationContext) =>
    askPlugin ? askPlugin(item, ctx) : { seconds: declaredSeconds(item) };

  // Code is fetched before an export (prepareCode) and read back by the
  // synchronous exporters.
  const code = new Map<string, unknown>();
  const codeKey = (
    item: SequencePluginItem,
    ctx: CodeExportContext,
    kind: string,
  ) =>
    JSON.stringify([
      kind,
      item.id,
      item.data,
      ctx.targetLibrary,
      ctx.stateStep,
    ]);
  const hasSequential = callbacks.includes("code.sequential");
  const hasJava = callbacks.includes("code.java");

  const createDefault = (): SequencePluginItem => ({
    kind: "plugin",
    id: makeId(),
    type,
    name: "",
    data: defaultsFor(fields),
  });

  const definitionForRegistry: ActionDefinition = {
    ...pluginStepBase,
    kind: type,
    owner: plugin.id,
    label,
    color: action.color ?? "#64748b",
    icon: action.icon === undefined ? undefined : sanitizeSvg(action.icon),
    fields,
    showInToolbar: true,
    button: { label },
    createDefault,
    onInsert: (ctx) => {
      ctx.sequence.splice(ctx.index, 0, createDefault());
      ctx.triggerReactivity();
    },

    calculateTime: (item: SequenceItem, ctx: TimeCalculationContext) => {
      const step = item as SequencePluginItem;
      return timedResult(step, label, timingOf(step, ctx), ctx);
    },

    prepareCode: async (item: SequenceItem, ctx: CodeExportContext) => {
      const step = item as SequencePluginItem;
      try {
        if (hasSequential) {
          const answer = await plugin.invoke(
            registrationId,
            "code.sequential",
            [{ step: asStep(step), library: libraryForContext(ctx).id }],
            CODE_TIMEOUT_MS,
          );
          code.set(
            codeKey(step, ctx, "sequential"),
            check(codeSchema, answer, "code"),
          );
        }
        if (hasJava) {
          const answer = await plugin.invoke(
            registrationId,
            "code.java",
            [{ step: asStep(step), state: ctx.stateStep ?? 0 }],
            CODE_TIMEOUT_MS,
          );
          code.set(
            codeKey(step, ctx, "java"),
            check(javaCodeSchema, answer, "code"),
          );
        }
      } catch {
        // Already reported against the plugin; the step exports as a comment.
      }
    },

    toSequentialCommand: (item: SequenceItem, ctx: CodeExportContext) => {
      const step = item as SequencePluginItem;
      const fetched = code.get(codeKey(step, ctx, "sequential"));
      if (typeof fetched === "string") return fetched;
      const { commands } = libraryForContext(ctx);
      // Without code of its own, a step keeps the routine's timing.
      const seconds = declaredSeconds(step);
      return seconds > 0
        ? commands.wait(seconds * 1000)
        : commands.instant(`{ /* ${step.name || label} */ }`);
    },

    toJavaCode: (item: SequenceItem, ctx: CodeExportContext) => {
      const step = item as SequencePluginItem;
      const fetched = code.get(codeKey(step, ctx, "java")) as
        | { code: string; states: number }
        | undefined;
      if (fetched) return { code: fetched.code, stepsUsed: fetched.states };
      return {
        code: `
        // ${step.name || label}: no code for this step.`,
        stepsUsed: 0,
      };
    },
  };

  actionRegistry.register(definitionForRegistry);
  return {
    dispose() {
      // Only if it's still ours: a later registration may have replaced it.
      if (actionRegistry.get(type) === definitionForRegistry) {
        actionRegistry.unregister(type);
      }
    },
  };
};
