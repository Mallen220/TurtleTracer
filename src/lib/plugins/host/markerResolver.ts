// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Keeps the position of plugin event markers (type "plugin") up to date:
// asks each marker's plugin when it fires, and saves the answer as the
// marker's position, which is what drawing and exporting use. Without the
// plugin, a marker keeps the position it was last given.
import { get } from "svelte/store";
import type { EventMarker, SequenceItem, TimelineEvent } from "../../../types";
import {
  linesStore,
  sequenceStore,
  timePredictionStore,
} from "../../projectStore";
import { markerTypeRegistry } from "../../registries";
import { interpolateTFromProfile } from "../../../utils/math";
import { currentPlan } from "./project";

/** Positions closer than this are the same. */
const EPSILON = 1e-4;

/**
 * Where a marker `seconds` into its step sits: the curve parameter for a
 * path (markers on paths are placed along the curve), the fraction of the
 * time for anything else.
 */
export function positionAt(
  seconds: number,
  stepStart: number,
  stepEnd: number,
  travel: TimelineEvent | undefined,
): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  if (travel?.motionProfile && travel.motionProfile.length > 1) {
    return clamp(
      interpolateTFromProfile(
        stepStart + seconds - travel.startTime,
        travel.motionProfile,
      ),
    );
  }
  const duration = stepEnd - stepStart;
  return duration > 0 ? clamp(seconds / duration) : 0;
}

function pluginMarkers(markers: EventMarker[] | undefined) {
  return (markers ?? []).filter((m) => m.type === "plugin" && m.pluginType);
}

/** Works out every plugin marker's position again and saves the ones that moved. */
export async function resolveMarkers() {
  const types = new Map(markerTypeRegistry.getAll().map((t) => [t.id, t]));
  if (types.size === 0) return;
  const plan = currentPlan();
  const timeline = get(timePredictionStore)?.timeline ?? [];

  const moved = new Map<string, number>(); // marker id → position
  const lookups: Promise<void>[] = [];
  const ask = (marker: EventMarker, stepId: string) => {
    const type = types.get(marker.pluginType!);
    const step = plan.steps.find((s) => s.id === stepId);
    if (!type || !step) return;
    lookups.push(
      type
        .resolve(marker, stepId)
        .then((seconds) => {
          if (seconds === null) return;
          const travel = timeline.find(
            (e) => e.type === "travel" && e.line?.id === stepId,
          );
          const position = positionAt(seconds, step.start, step.end, travel);
          if (Math.abs(position - (marker.position ?? 0)) > EPSILON) {
            moved.set(marker.id, position);
          }
        })
        .catch(() => {
          // Reported against the plugin; the marker stays where it was.
        }),
    );
  };

  for (const line of get(linesStore)) {
    for (const marker of pluginMarkers(line.eventMarkers))
      ask(marker, line.id!);
  }
  for (const item of get(sequenceStore)) {
    if (item.kind === "wait" || item.kind === "rotate") {
      for (const marker of pluginMarkers(item.eventMarkers))
        ask(marker, item.id);
    }
  }
  await Promise.all(lookups);
  if (moved.size === 0) return;

  // Derived from the plugin's answer, so it isn't recorded as an edit.
  const place = (markers: EventMarker[] | undefined) =>
    markers?.some((m) => moved.has(m.id))
      ? markers.map((m) =>
          moved.has(m.id) ? { ...m, position: moved.get(m.id)! } : m,
        )
      : markers;
  linesStore.update((lines) =>
    lines.map((l) => {
      const markers = place(l.eventMarkers);
      return markers === l.eventMarkers ? l : { ...l, eventMarkers: markers };
    }),
  );
  sequenceStore.update((sequence) =>
    sequence.map((item): SequenceItem => {
      if (item.kind !== "wait" && item.kind !== "rotate") return item;
      const markers = place(item.eventMarkers);
      return markers === item.eventMarkers
        ? item
        : { ...item, eventMarkers: markers };
    }),
  );
}
