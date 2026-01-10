// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
export interface FeatureHighlight {
  title: string;
  id: string; // unique id (e.g. "1.5.0-performance")
  content: string; // Markdown content
}

// Import all feature files here
// Vite's ?raw import allows us to get the file content as a string
// @ts-ignore
import v1_5_1_features from "./v1.5.1.md?raw";
// @ts-ignore
import v1_5_2_features from "./v1.5.2.md?raw";
// @ts-ignore
import v1_6_0_features from "./v1.6.0.md?raw";
// @ts-ignore
import v2_0_0_features from "./v2.0.0.md?raw";

export const features: FeatureHighlight[] = [
  {
    id: "v2.0.0",
    title: "Version 2.0.0 Highlights",
    content: v2_0_0_features,
  },
  {
    id: "v1.6.0",
    title: "Version 1.6.0 Highlights",
    content: v1_6_0_features,
  },
  {
    id: "v1.5.2",
    title: "Version 1.5.2 Highlights",
    content: v1_5_2_features,
  },
  {
    id: "v1.5.1",
    title: "Version 1.5.1 Highlights",
    content: v1_5_1_features,
  },
];
