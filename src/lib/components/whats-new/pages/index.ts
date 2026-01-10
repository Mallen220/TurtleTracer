// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { features } from "../features";

// Import page content
// @ts-ignore
import gettingStartedContent from "./getting-started.md?raw";
// @ts-ignore
import controlsContent from "./controls.md?raw";

export interface Page {
  id: string;
  title: string;
  description: string;
  icon: string; // Icon name (key in icons object)
  content?: string; // Markdown content
  type: "page" | "highlight" | "changelog" | "external";
  highlightId?: string; // For linking to a specific highlight
  url?: string; // For external links
}

export const pages: Page[] = [
  {
    id: "recent-highlights",
    title: "Recent Highlights",
    description: "Check out the most recent updates and features.",
    type: "highlight",
    highlightId: features[0]?.id, // Default to the latest feature
    icon: "sparkles",
  },
  {
    id: "getting-started",
    title: "Getting Started",
    description: "New here? Learn the basics of using the visualizer.",
    type: "page",
    content: gettingStartedContent,
    icon: "rocket",
  },
  {
    id: "controls",
    title: "Controls & Shortcuts",
    description: "Master the controls to speed up your workflow.",
    type: "page",
    content: controlsContent,
    icon: "keyboard",
  },
  {
    id: "changelog",
    title: "Full Changelog",
    description: "View the complete history of changes and fixes.",
    type: "changelog",
    icon: "file-text",
  },
];
