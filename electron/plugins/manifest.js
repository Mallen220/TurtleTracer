// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// plugin.json: what a plugin is, what it contains and what it asks for.
import fs from "node:fs/promises";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import { PLUGIN_ID, isSafeRelativePath } from "./files.js";

/** The plugin API version this app runs. */
export const API_VERSION = 2;

/** Permissions a plugin can ask for. Everything else is always allowed. */
export const PERMISSIONS = ["project.write", "files.pick"];

const relativePath = (extensions) =>
  z
    .string()
    .refine(isSafeRelativePath, "must be a relative path inside the plugin")
    .refine(
      (p) => extensions.some((ext) => p.toLowerCase().endsWith(ext)),
      `must end in ${extensions.join(", ")}`,
    );

const SCRIPT = [".ts", ".tsx", ".js", ".mjs", ".jsx"];

// npm package names, scoped or not.
const PACKAGE_NAME =
  /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]{0,213}$/;

const manifestSchema = z.strictObject({
  id: z.string().regex(PLUGIN_ID, "use lower-case letters, digits and dashes"),
  name: z.string().trim().min(1).max(80),
  version: z
    .string()
    .refine((v) => semver.valid(v) !== null, "must be a version like 1.0.0"),
  apiVersion: z.number().int(),
  description: z.string().max(500).optional(),
  author: z.string().max(120).optional(),
  main: relativePath(SCRIPT).optional(),
  views: z
    .record(
      z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
      z.strictObject({
        entry: relativePath([".html"]),
        slot: z.enum(["field", "panel"]),
        title: z.string().trim().min(1).max(40),
      }),
    )
    .refine((views) => Object.keys(views).length <= 8, "at most 8 views")
    .optional(),
  themes: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(60),
        css: relativePath([".css"]),
      }),
    )
    .max(8)
    .optional(),
  // Checked field by field in the app, which draws the settings form.
  settings: z.array(z.unknown()).max(64).optional(),
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length).optional(),
  dependencies: z
    .record(
      z.string().regex(PACKAGE_NAME, "must be an npm package name"),
      z
        .string()
        .refine(
          (range) => semver.validRange(range) !== null,
          "must be a version or version range",
        ),
    )
    .refine((deps) => Object.keys(deps).length <= 32, "at most 32 packages")
    .optional(),
});

/** Turns zod's issues into one readable line. */
function describeIssues(error) {
  return error.issues
    .map((issue) => {
      const where = issue.path.join(".");
      return where ? `${where}: ${issue.message}` : issue.message;
    })
    .join("; ");
}

/**
 * Checks a parsed manifest. Returns the manifest, or an error saying what's
 * wrong with it.
 * @param {unknown} data
 * @param {string} folderName The folder it was found in; must match the id.
 * @returns {{ manifest: z.infer<typeof manifestSchema> } | { error: string }}
 */
export function validateManifest(data, folderName) {
  const result = manifestSchema.safeParse(data);
  if (!result.success) {
    return { error: `plugin.json is invalid: ${describeIssues(result.error)}` };
  }
  const manifest = result.data;
  if (manifest.id !== folderName) {
    return {
      error: `plugin.json says its id is "${manifest.id}", but it's in a folder called "${folderName}". They must match.`,
    };
  }
  if (manifest.apiVersion !== API_VERSION) {
    return {
      error: `Written for plugin API version ${manifest.apiVersion}; this version of Turtle Tracer runs version ${API_VERSION}.`,
    };
  }
  return { manifest };
}

/**
 * Reads and checks `plugin.json` in a plugin folder.
 * @param {string} folder
 */
export async function readManifest(folder) {
  let text;
  try {
    text = await fs.readFile(path.join(folder, "plugin.json"), "utf8");
  } catch {
    return { error: "This folder has no plugin.json." };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { error: `plugin.json isn't valid JSON: ${e.message}` };
  }
  return validateManifest(data, path.basename(folder));
}
