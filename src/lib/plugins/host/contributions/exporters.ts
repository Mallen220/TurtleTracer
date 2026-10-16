// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Exporters: new formats in the export menu and dialog.
import { exporterRegistry } from "../../../exporters";
import { check, codeSchema, exporterSchema } from "../schemas";
import type { ContributionFactory } from "./types";

export const EXPORT_TIMEOUT_MS = 15_000;

export const exporterFactory: ContributionFactory = (
  plugin,
  registrationId,
  definition,
) => {
  const exporter = check(exporterSchema, definition, "exporter");
  const id = `plugin:${plugin.id}.${exporter.name}`;
  exporterRegistry.register({
    id,
    name: exporter.label,
    description: `From the ${plugin.manifest.name} plugin`,
    owner: plugin.id,
    extension: exporter.extension,
    language: exporter.language,
    exportCode: async () => {
      const code = await plugin.invoke(
        registrationId,
        "export",
        [{ project: plugin.snapshot(), plan: plugin.plan() }],
        EXPORT_TIMEOUT_MS,
        { computes: true },
      );
      return check(codeSchema, code, "export");
    },
  });
  return { dispose: () => exporterRegistry.unregister(id) };
};
