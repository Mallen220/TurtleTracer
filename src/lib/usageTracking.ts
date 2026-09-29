// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Tracks how long the app has been used, and asks for a rating once it has
// been used enough.
import { get } from "svelte/store";
import { ratingDialogAutoOpened, showRatingDialog } from "../stores";
import { settingsStore } from "./projectStore";
import { saveSettings } from "../utils/settingsPersistence";
import { isBrowser } from "../utils/platform";
import pkg from "../../package.json";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

const CHECK_INTERVAL_MS = 10 * MINUTE_MS;
const MIN_APP_UPTIME_MS = 5 * MINUTE_MS;
const USAGE_BEFORE_RATING_MS = 10 * HOUR_MS;

const appStartTime = Date.now();
let lastRecordedTime = appStartTime;

/** Adds the time since the last call to the saved total usage time. */
export async function recordUsageTime() {
  const now = Date.now();
  const elapsed = now - lastRecordedTime;
  lastRecordedTime = now;
  settingsStore.update((s) => ({
    ...s,
    totalUsageTime: (s.totalUsageTime || 0) + elapsed,
  }));
  await saveSettings(get(settingsStore));
}

/** True if the user has rated, or asked not to be asked about this version. */
function ratingIsSettled() {
  const { submittedRatings, dismissedRatings } = get(settingsStore);
  const hasRatedAnyVersion =
    submittedRatings && Object.keys(submittedRatings).length > 0;
  return (
    hasRatedAnyVersion ||
    dismissedRatings?.[pkg.version] ||
    dismissedRatings?.["all"]
  );
}

/**
 * Records usage time and, once the user has used the app for long enough and
 * hasn't already answered, opens the rating dialog.
 */
export function tryShowRatingDialog() {
  if (isBrowser || ratingIsSettled()) return;
  // Offline: the interval will check again later.
  if (!navigator.onLine || get(showRatingDialog)) return;
  // Not right after launch.
  if (Date.now() - appStartTime < MIN_APP_UPTIME_MS) return;

  recordUsageTime().catch((e) => console.error("Failed to save usage time", e));

  if ((get(settingsStore).totalUsageTime || 0) >= USAGE_BEFORE_RATING_MS) {
    ratingDialogAutoOpened.set(true);
    showRatingDialog.set(true);
  }
}

/** Checks whether to ask for a rating every few minutes. Returns a stop function. */
export function startRatingChecks() {
  const id = setInterval(tryShowRatingDialog, CHECK_INTERVAL_MS);
  return () => clearInterval(id);
}
