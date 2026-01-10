// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { features } from "../features";

// Import page content
// @ts-ignore
import gettingStartedContent from "./getting-started.md?raw";
// @ts-ignore
import controlsContent from "./controls.md?raw";
// @ts-ignore
import fileManagementContent from "./file-management.md?raw";
// @ts-ignore
import pathEditingContent from "./path-editing.md?raw";
// @ts-ignore
import simulationContent from "./simulation.md?raw";
// @ts-ignore
import obstaclesContent from "./obstacles.md?raw";
// @ts-ignore
import exportingContent from "./exporting.md?raw";
// @ts-ignore
import settingsContent from "./settings.md?raw";
// @ts-ignore
import eventMarkersContent from "./event-markers.md?raw";
// @ts-ignore
import optimizationContent from "./optimization.md?raw";

export interface Page {
  id: string;
  title: string;
  description: string;
  icon: string; // Icon name (key in icons object)
  content?: string; // Markdown content
  type: "page" | "highlight" | "changelog" | "external" | "release-list";
  highlightId?: string; // For linking to a specific highlight
  url?: string; // For external links
}

export const pages: Page[] = [
  {
    id: "recent-highlights",
    title: "Latest Highlights",
    description: "Check out the most recent updates and features.",
    type: "highlight",
    // Do NOT capture a static highlightId at module load time because the
    // features list may be populated asynchronously by the bundler/runtime.
    // Resolve the latest feature at click/runtime instead.
    highlightId: undefined,
    icon: "sparkles",
  },
  {
    id: "release-notes",
    title: "Release Notes",
    description: "View highlights from previous versions.",
    type: "release-list",
    icon: "clock",
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
    id: "file-management",
    title: "File Management",
    description: "Learn how to organize, save, and load your projects.",
    type: "page",
    content: fileManagementContent,
    icon: "folder",
  },
  {
    id: "path-editing",
    title: "Path Editing",
    description: "Master the tools for creating and refining robot paths.",
    type: "page",
    content: pathEditingContent,
    icon: "pencil",
  },
  {
    id: "simulation",
    title: "Simulation & Playback",
    description: "Visualize robot movement, physics, and timing.",
    type: "page",
    content: simulationContent,
    icon: "play",
  },
  {
    id: "obstacles",
    title: "Obstacles",
    description: "Define field obstacles to ensure collision-free paths.",
    type: "page",
    content: obstaclesContent,
    icon: "cube",
  },
  {
    id: "event-markers",
    title: "Event Markers",
    description: "Trigger actions at specific points along the path.",
    type: "page",
    content: eventMarkersContent,
    icon: "map-pin",
  },
  {
    id: "optimization",
    title: "Path Optimization",
    description: "Automatically refine paths for speed and safety.",
    type: "page",
    content: optimizationContent,
    icon: "chart-bar",
  },
  {
    id: "exporting",
    title: "Exporting Code",
    description: "Generate Java code for your robot controller.",
    type: "page",
    content: exportingContent,
    icon: "code",
  },
  {
    id: "settings",
    title: "Settings",
    description: "Customize the visualizer to match your robot.",
    type: "page",
    content: settingsContent,
    icon: "cog",
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
