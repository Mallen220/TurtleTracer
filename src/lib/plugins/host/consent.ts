// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Asking the user before a plugin gets more than the basics: permissions,
// and npm packages that will be downloaded for it.
import type { PluginManifest, PluginPermission } from "../protocol/ipc";
import { dialogRegistry } from "../../registries";
import PluginConsentDialog from "../ui/PluginConsentDialog.svelte";

/** What each permission lets a plugin do, in the user's terms. */
export const PERMISSION_TEXT: Record<PluginPermission, string> = {
  "project.write":
    "Change your project: add, move and remove paths, points, shapes and steps. You can undo every change.",
  "files.pick":
    "Ask you to choose project files, and read the ones you choose.",
};

/**
 * What the user agrees to for a plugin, as text. If a new version asks for
 * more, this changes and the user is asked again.
 */
export function grantFor(manifest: PluginManifest): string {
  return JSON.stringify({
    permissions: [...(manifest.permissions ?? [])].sort(),
    dependencies: Object.entries(manifest.dependencies ?? {}).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
  });
}

/** Whether the plugin asks for anything that needs the user's agreement. */
export function needsConsent(manifest: PluginManifest): boolean {
  return (
    (manifest.permissions?.length ?? 0) > 0 ||
    Object.keys(manifest.dependencies ?? {}).length > 0
  );
}

/** Shows the consent dialog. Resolves to whether the user agreed. */
export function askConsent(manifest: PluginManifest): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `plugin-consent-${manifest.id}`;
    const answer = (agreed: boolean) => {
      dialogRegistry.unregister(id);
      resolve(agreed);
    };
    dialogRegistry.register({
      id,
      component: PluginConsentDialog,
      props: {
        manifest,
        permissions: (manifest.permissions ?? []).map(
          (p) => PERMISSION_TEXT[p],
        ),
        onAllow: () => answer(true),
        onCancel: () => answer(false),
      },
    });
  });
}
