// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  changePlaybackSpeedBy,
  resetPlaybackSpeed,
} from "../../../../lib/components/shortcuts/playback";
import { playbackSpeedStore } from "../../../../lib/projectStore";

describe("playback shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playbackSpeedStore.set(1);
  });

  describe("changePlaybackSpeedBy", () => {
    it("should clamp speed between 0.25 and 3.0", () => {
      const play = vi.fn();

      changePlaybackSpeedBy(5, play);
      let speed;
      playbackSpeedStore.subscribe((v) => (speed = v))();
      expect(speed).toBe(3);

      changePlaybackSpeedBy(-5, play);
      playbackSpeedStore.subscribe((v) => (speed = v))();
      expect(speed).toBe(0.25);
    });

    it("should call play if delta is not zero", () => {
      const play = vi.fn();
      changePlaybackSpeedBy(0.25, play);
      expect(play).toHaveBeenCalled();

      const play2 = vi.fn();
      changePlaybackSpeedBy(0, play2);
      expect(play2).not.toHaveBeenCalled();
    });
  });

  describe("resetPlaybackSpeed", () => {
    it("should reset speed to 1.0", () => {
      playbackSpeedStore.set(2);
      resetPlaybackSpeed();
      let speed;
      playbackSpeedStore.subscribe((v) => (speed = v))();
      expect(speed).toBe(1);
    });
  });
});
