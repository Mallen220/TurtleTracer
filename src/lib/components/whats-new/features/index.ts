export interface FeatureHighlight {
  title: string;
  id: string; // unique id (e.g. "1.5.0-performance")
  content: string; // Markdown content
}

// Import all feature files here
// Vite's ?raw import allows us to get the file content as a string
// @ts-ignore
import v1_5_1_features from "./v1.5.1.md?raw";

export const features: FeatureHighlight[] = [
  {
    id: "v1.5.1",
    title: "Version 1.5.1 Highlights",
    content: v1_5_1_features,
  },
];
