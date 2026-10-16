// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Event marker types (api/turtle.ts MarkerTypeDefinition). The plugin says
// when a marker fires; the host saves that as the marker's position, so the
// marker exports like any other (see host/markerResolver.ts).
import type { FormValues } from "../../api";
import { markerTypeRegistry } from "../../../registries";
import { check, markerSchema } from "../schemas";
import type { ContributionFactory } from "./types";

const RESOLVE_TIMEOUT_MS = 2000;

export const markerFactory: ContributionFactory = (
  plugin,
  registrationId,
  definition,
) => {
  const marker = check(markerSchema, definition, "marker type");
  const id = `${plugin.id}.${marker.name}`;

  markerTypeRegistry.register({
    id,
    owner: plugin.id,
    label: marker.label,
    fields: marker.fields ?? [],
    async resolve(eventMarker, stepId) {
      const plan = plugin.plan();
      const step = plan.steps.find((s) => s.id === stepId);
      if (!step) return null;
      const answer = await plugin.invoke(
        registrationId,
        "resolve",
        [
          {
            marker: {
              id: eventMarker.id,
              name: eventMarker.name,
              values: { ...eventMarker.parameters } as FormValues,
            },
            step,
            plan,
            project: plugin.snapshot(),
          },
        ],
        RESOLVE_TIMEOUT_MS,
        { computes: true },
      );
      if (answer === null || answer === undefined) return null;
      if (typeof answer !== "number" || !Number.isFinite(answer)) {
        throw new Error(
          "A marker's resolve() must return a number of seconds or null.",
        );
      }
      return answer;
    },
  });
  return { dispose: () => markerTypeRegistry.unregister(id) };
};
