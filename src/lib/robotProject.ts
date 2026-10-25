// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The team's robot project, as last read from disk: looked at again when the
// paths folder changes and when the app comes back into focus (the team may
// have changed their code meanwhile).
import { writable } from "svelte/store";
import { getElectronAPI } from "../utils/platform";
import { detectRobotProject, type RobotProject } from "../utils/robotProject";

export const robotProject = writable<RobotProject | null>(null);

let latest = 0;

/** Reads the robot project `directory` is in. Later calls win over earlier ones still running. */
export async function refreshRobotProject(directory: string | null) {
  const call = ++latest;
  const api = getElectronAPI();
  if (!directory || !api?.readFile || !api.fileExists) {
    robotProject.set(null);
    return;
  }
  try {
    const found = await detectRobotProject(directory, {
      fileExists: (path) => api.fileExists(path),
      readFile: (path) => api.readFile(path),
      findFiles: api.findFiles
        ? (root, endings, options) => api.findFiles!(root, endings, options)
        : undefined,
    });
    if (call === latest) robotProject.set(found);
  } catch (e) {
    console.warn("Couldn't read the robot project", e);
    if (call === latest) robotProject.set(null);
  }
}
