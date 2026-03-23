import { get } from "svelte/store";
import { playbackSpeedStore } from "../../projectStore";

export function changePlaybackSpeedBy(delta: number, play: () => void) {
  const playbackSpeed = get(playbackSpeedStore);
  const clamped = Math.max(
    0.25,
    Math.min(3.0, Math.round((playbackSpeed + delta) * 100) / 100),
  );
  playbackSpeedStore.set(clamped);
  if (delta !== 0) play();
}

export function resetPlaybackSpeed() {
  playbackSpeedStore.set(1.0);
}
