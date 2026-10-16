// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Simulators: what a real robot would do with the plan (api/turtle.ts).
import { simulatorRegistry } from "../../../registries";
import { check, simulationSchema, simulatorSchema } from "../schemas";
import type { ContributionFactory } from "./types";

/** A simulation may run this long before it's given up on. */
export const SIMULATION_TIMEOUT_MS = 60_000;

export const simulatorFactory: ContributionFactory = (
  plugin,
  registrationId,
  definition,
) => {
  const simulator = check(simulatorSchema, definition, "simulator");
  const id = `${plugin.id}.${simulator.name}`;
  simulatorRegistry.register({
    id,
    owner: plugin.id,
    label: simulator.label,
    async simulate() {
      const answer = await plugin.invoke(
        registrationId,
        "simulate",
        [{ project: plugin.snapshot(), plan: plugin.plan() }],
        SIMULATION_TIMEOUT_MS,
        { computes: true },
      );
      return check(simulationSchema, answer, "simulation");
    },
  });
  return { dispose: () => simulatorRegistry.unregister(id) };
};
