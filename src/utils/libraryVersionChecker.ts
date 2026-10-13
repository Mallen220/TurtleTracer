// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { compareVersions } from "./versions";
let latestRelease: Promise<string | null> | null = null;

/**
 * The latest TurtleTracerLib version, looked up once per session: the check
 * runs whenever the project folder changes, and GitHub allows few requests
 * without a token (shared by everyone on a school network).
 */
function latestLibraryVersion(): Promise<string | null> {
  latestRelease ??= fetch(
    "https://api.github.com/repos/Mallen220/TurtleTracerLib/releases/latest",
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
      const tag = ((await res.json()) as { tag_name?: string }).tag_name;
      return tag?.startsWith("v") ? tag.slice(1) : (tag ?? null);
    })
    .catch(() => {
      latestRelease = null; // Try again next time.
      return null;
    });
  return latestRelease;
}

export async function checkLibraryVersion(
  directory: string,
  electronAPI: any,
  notificationSet: any,
) {
  if (!electronAPI?.readFile || !electronAPI.fileExists) return;

  try {
    // 1. Fetch latest version from GitHub
    const latestVersion = await latestLibraryVersion();
    if (!latestVersion) return;

    // 2. Scan gradle files for local version
    const filesToCheck = [
      "build.dependencies.gradle",
      "TeamCode/build.gradle",
      "build.gradle",
    ];

    let localVersion: string | null = null;
    let projectRoot = directory;

    // Normalize path to handle both Windows and Unix slashes
    const normalizedDir = directory.replaceAll("\\", "/");
    const parts = normalizedDir.split("/");
    const teamCodeIndex = parts.indexOf("TeamCode");

    const resolve = (dir: string, file: string) =>
      dir + (dir.endsWith("/") ? "" : "/") + file;

    if (teamCodeIndex > 0) {
      // The user is inside TeamCode or a subdirectory of it
      // The project root is everything before TeamCode
      projectRoot = parts.slice(0, teamCodeIndex).join("/");
    } else {
      // The user might be directly at the project root. Check if TeamCode exists here.
      const teamCodeExists = await electronAPI.fileExists(
        resolve(directory, "TeamCode"),
      );
      if (!teamCodeExists) {
        return; // Not an FTC project, do nothing
      }
    }

    for (const file of filesToCheck) {
      const filePath = resolve(projectRoot, file);
      const exists = await electronAPI.fileExists(filePath);
      if (exists) {
        const content = await electronAPI.readFile(filePath);
        // Look for com.github.Mallen220:TurtleTracerLib:X.Y.Z or similar
        const match = content.match(/Mallen220:TurtleTracerLib:?([0-9.]+)/i);
        if (match?.[1]) {
          localVersion = match[1];
          break;
        }
      }
    }

    // 3. Compare and notify
    if (localVersion) {
      if (compareVersions(localVersion, latestVersion) < 0) {
        notificationSet({
          message: `Your Turtle Tracer Lib (v${localVersion}) is out of date. Please upgrade to the latest version (v${latestVersion}).`,
          type: "warning",
          timeout: 10000,
          actionLabel: "github",
          action: () => {
            electronAPI.openExternal(
              "https://github.com/Mallen220/TurtleTracerLib",
            );
          },
        });
      }
    } else {
      // Could not find local version, but we are in an FTC project, so inform about the latest
      notificationSet({
        message: `Turtle Tracer Lib v${latestVersion} is now available. Ensure your library is up to date!`,
        type: "info",
        timeout: 10000,
        actionLabel: "github",
        action: () => {
          electronAPI.openExternal(
            "https://github.com/Mallen220/TurtleTracerLib",
          );
        },
      });
    }
  } catch (e) {
    console.warn("Failed to check library version", e);
  }
}
