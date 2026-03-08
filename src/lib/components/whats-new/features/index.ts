// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export interface FeatureHighlight {
  title: string;
  id: string; // unique id (e.g. "v1.5.1")
  content: string; // Markdown content
}

// Dynamically import all .md files from this directory as raw strings.
// Vite will transform this at build time into the actual file contents.
const modules = import.meta.glob<string>("./*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

// Default template content used by bump-version.js
const DEFAULT_TEMPLATE = `### What's New!

## **Features:**

## **Bug Fixes:**
`;

// Check if newest.md is just the template
function isNewestTemplate(content: string): boolean {
  return content.trim() === DEFAULT_TEMPLATE.trim();
}

// Load newest.md separately if it exists — only in dev mode (do not show in packaged Electron)
let newestFeature: FeatureHighlight | null = null;
if (import.meta.env.DEV) {
  const newestModule = Object.entries(modules).find(([path]) =>
    path.endsWith("/newest.md"),
  );
  if (newestModule && newestModule[1]) {
    const content = newestModule[1];
    // Only use newest.md if it's not just the template
    if (!isNewestTemplate(content)) {
      newestFeature = {
        id: "newest",
        title: "Latest Highlights",
        content,
      };
    }
  }
}

export const features: FeatureHighlight[] = Object.entries(modules)
  .map(([path, content]) => {
    const fileName = path.split("/").pop()!;
    const id = fileName.replace(/\.md$/, "");
    const title = `Version ${id.replace(/^v/, "")} Highlights`;
    return { id, title, content };
  })
  .filter((f) => f.id !== "newest")
  // Sort descending by version (newest first)
  .sort((a, b) => compareVersions(b.id, a.id));

/**
 * Get the ID of the feature to show for "Latest Highlights".
 * Returns "newest" if newest.md exists and is not the template,
 * otherwise returns the most recent version's ID.
 */
export function getLatestHighlightId(): string | undefined {
  if (newestFeature) {
    return "newest";
  }
  return features[0]?.id;
}

/**
 * Get all features including newest if it's not the template.
 */
export function getAllFeatures(): FeatureHighlight[] {
  if (newestFeature) {
    return [newestFeature, ...features];
  }
  return features;
}
