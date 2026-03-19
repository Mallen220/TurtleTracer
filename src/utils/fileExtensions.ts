// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export const DEFAULT_PROJECT_EXTENSION = ".turt";
export const LEGACY_PROJECT_EXTENSION = ".pp";
export const SUPPORTED_PROJECT_EXTENSIONS = [
  DEFAULT_PROJECT_EXTENSION,
  LEGACY_PROJECT_EXTENSION,
] as const;

export const SUPPORTED_PROJECT_EXTENSION_FILTERS = ["turt", "pp"] as const;

export function isSupportedProjectFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_PROJECT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isLegacyProjectFileName(name: string): boolean {
  return name.toLowerCase().endsWith(LEGACY_PROJECT_EXTENSION);
}

export function stripProjectExtension(name: string): string {
  return name.replace(/\.(pp|turt)$/i, "");
}

export function ensureDefaultProjectExtension(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(DEFAULT_PROJECT_EXTENSION)) return path;
  if (lower.endsWith(LEGACY_PROJECT_EXTENSION)) {
    return (
      path.slice(0, -LEGACY_PROJECT_EXTENSION.length) +
      DEFAULT_PROJECT_EXTENSION
    );
  }
  return `${path}${DEFAULT_PROJECT_EXTENSION}`;
}

export function getProjectExtensionFromPath(path?: string | null): string {
  if (!path) return DEFAULT_PROJECT_EXTENSION;
  const lower = path.toLowerCase();
  if (lower.endsWith(LEGACY_PROJECT_EXTENSION)) return LEGACY_PROJECT_EXTENSION;
  if (lower.endsWith(DEFAULT_PROJECT_EXTENSION))
    return DEFAULT_PROJECT_EXTENSION;
  return DEFAULT_PROJECT_EXTENSION;
}
