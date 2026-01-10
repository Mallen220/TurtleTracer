// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
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

export const features: FeatureHighlight[] = Object.entries(modules)
  .map(([path, content]) => {
    const fileName = path.split("/").pop()!;
    const id = fileName.replace(/\.md$/, "");
    const title = `Version ${id.replace(/^v/, "")} Highlights`;
    return { id, title, content };
  })
  // Sort descending by version (newest first)
  .sort((a, b) => compareVersions(b.id, a.id));
