// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { getElectronAPI } from "./platform";

const TRACKER_URL =
  "https://github.com/Mallen220/TurtleTracer/releases/download/tracker/ms-store-tracker.zip";
const TRACKED_KEY = "msStoreTracked";

/**
 * Counts a Microsoft Store install once, by downloading a small asset from
 * the GitHub release tagged `tracker` (its download count is the install
 * count). Does nothing outside the Store build or after the first success.
 */
export async function trackMicrosoftStoreInstall() {
  const electronAPI = getElectronAPI();
  if (!electronAPI?.isWindowsStore) return;

  try {
    if (!(await electronAPI.isWindowsStore())) return;
    if (localStorage.getItem(TRACKED_KEY)) return;

    const response = await fetch(TRACKER_URL);
    if (response.ok) {
      localStorage.setItem(TRACKED_KEY, "true");
    } else {
      console.warn(
        "Microsoft Store tracking failed: Asset not found or network error",
      );
    }
  } catch (e) {
    console.warn("Microsoft Store tracking failed", e);
  }
}
