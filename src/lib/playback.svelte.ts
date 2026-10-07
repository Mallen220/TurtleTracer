// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Keeps the timeline, the animation and the robot's pose in step with the
// path being edited.
import { onMount } from "svelte";
import { fromStore, get } from "svelte/store";
import * as d3 from "d3";
import { collisionMarkers } from "../stores";
import {
  startPointStore,
  linesStore,
  shapesStore,
  sequenceStore,
  settingsStore,
  robotXYStore,
  robotHeadingStore,
  percentStore,
  hoverPercentStore,
  hoverRobotXYStore,
  hoverRobotHeadingStore,
  playingStore,
  loopAnimationStore,
  playbackSpeedStore,
  loopRangeStore,
  loopRangeActiveStore,
  isDraggingStore,
  timePredictionStore,
} from "./projectStore";
import { diffMode, committedData } from "./diffStore";
import {
  createAnimationController,
  type AnimationController,
} from "../utils/animation";
import { calculatePathTime, calculateRobotState } from "../utils";
import { validatePath } from "../utils/validation";
import type { Line, Point, TimePrediction } from "../types/index";

// Pose calculations here stay in inches; the field renderer scales them.
const IDENTITY_SCALE = d3.scaleLinear();

/** The robot's heading before the path starts moving. */
function startHeading(startPoint: Point) {
  if (startPoint.heading === "constant") return -startPoint.degrees;
  if (startPoint.heading === "linear") return -startPoint.startDeg;
  return 0;
}

/**
 * The robot's pose (in inches) `globalTime` seconds into playback. In diff
 * mode both paths share one timeline, so the shorter one waits at its end.
 */
function robotPoseAt(
  globalTime: number,
  prediction: TimePrediction,
  totalTime: number,
  pathLines: Line[],
  start: Point,
) {
  const pathPercent =
    totalTime > 0 ? Math.min(100, (globalTime / totalTime) * 100) : 0;
  return calculateRobotState(
    pathPercent,
    prediction.timeline,
    pathLines,
    start,
    IDENTITY_SCALE,
    IDENTITY_SCALE,
  );
}

/**
 * Must be created while a component is initialising: it registers effects
 * and creates the animation controller when the component mounts.
 */
export class Playback {
  /** How long the path takes, when it was last calculated. */
  timePrediction = $state.raw<TimePrediction | null>(null);
  /** Where the committed path's robot is, in diff mode. */
  committedRobotState: { x: number; y: number; heading: number } | null =
    $state(null);
  controller: AnimationController | undefined = $state();

  #startPoint = fromStore(startPointStore);
  #lines = fromStore(linesStore);
  #sequence = fromStore(sequenceStore);
  #settings = fromStore(settingsStore);
  #shapes = fromStore(shapesStore);
  #percent = fromStore(percentStore);
  #hoverPercent = fromStore(hoverPercentStore);
  #playing = fromStore(playingStore);
  #loopAnimation = fromStore(loopAnimationStore);
  #playbackSpeed = fromStore(playbackSpeedStore);
  #loopRange = fromStore(loopRangeStore);
  #loopRangeActive = fromStore(loopRangeActiveStore);
  #isDragging = fromStore(isDraggingStore);
  #diffMode = fromStore(diffMode);
  #committed = fromStore(committedData);

  #hasPath = $derived(
    this.#lines.current.length > 0 || this.#sequence.current.length > 0,
  );

  #committedPrediction = $derived.by(() => {
    const committed = this.#committed.current;
    if (!this.#diffMode.current || !committed) return null;
    return calculatePathTime(
      committed.startPoint,
      committed.lines,
      committed.settings,
      committed.sequence,
    );
  });

  #currentDuration = $derived(this.timePrediction?.totalTime ?? 0);
  #committedDuration = $derived(this.#committedPrediction?.totalTime ?? 0);

  /** Seconds of path being played. In diff mode both paths play on one timeline, as long as the longer one. */
  effectiveDuration = $derived(
    this.#diffMode.current
      ? Math.max(this.#currentDuration, this.#committedDuration)
      : this.#currentDuration,
  );

  /** Seconds the animation takes at the chosen speed. */
  #animationDuration = $derived(
    this.effectiveDuration / this.#playbackSpeed.current,
  );

  constructor() {
    onMount(() => {
      this.controller = createAnimationController(
        this.#animationDuration,
        (percent) => percentStore.set(percent),
        () => playingStore.set(false),
      );
    });

    this.#trackTimePrediction();
    this.#validateContinuously();
    this.#syncController();
    this.#syncRobotPose();
    this.#syncHoverPose();
  }

  #trackTimePrediction() {
    $effect(() => {
      // Too slow to recompute on every frame of a drag; it catches up on drop.
      if (this.#isDragging.current) return;
      const prediction = calculatePathTime(
        this.#startPoint.current,
        this.#lines.current,
        this.#settings.current,
        this.#sequence.current,
      );
      this.timePrediction = prediction;
      timePredictionStore.set(prediction);
    });
  }

  #validateContinuously() {
    $effect(() => {
      const settings = this.#settings.current;
      const prediction = this.timePrediction;
      if (settings?.validationDisabled) {
        if (get(collisionMarkers).length > 0) collisionMarkers.set([]);
        return;
      }
      if (!prediction || this.#isDragging.current) return;
      validatePath(
        this.#startPoint.current,
        this.#lines.current,
        settings,
        this.#sequence.current,
        this.#shapes.current,
        true, // silent
        prediction.timeline,
      );
    });
  }

  #syncController() {
    $effect(() => {
      this.controller?.setDuration(this.#animationDuration);
      this.controller?.setLoop(this.#loopAnimation.current);
      this.controller?.setPlaybackRange(
        this.#loopRange.current[0],
        this.#loopRange.current[1],
        this.#loopRangeActive.current,
      );
    });

    // The playing store is the source of truth; the controller follows it.
    $effect(() => {
      const controller = this.controller;
      if (!controller) return;
      const playing = this.#playing.current;
      if (playing && controller.isPlaying() === false) controller.play();
      if (!playing && controller.isPlaying()) controller.pause();
    });
  }

  #syncRobotPose() {
    $effect(() => {
      const prediction = this.timePrediction;
      const startPoint = this.#startPoint.current;

      if (!prediction?.timeline || !this.#hasPath) {
        // Nothing to animate: show the robot at the start point.
        robotXYStore.set({ x: startPoint.x, y: startPoint.y });
        robotHeadingStore.set(startHeading(startPoint));
        this.committedRobotState = null;
        return;
      }

      const globalTime = (this.#percent.current / 100) * this.effectiveDuration;
      const pose = robotPoseAt(
        globalTime,
        prediction,
        this.#currentDuration,
        this.#lines.current,
        startPoint,
      );
      robotXYStore.set({ x: pose.x, y: pose.y });
      robotHeadingStore.set(pose.heading);

      const committed = this.#committed.current;
      const committedPrediction = this.#committedPrediction;
      this.committedRobotState =
        this.#diffMode.current && committed && committedPrediction
          ? robotPoseAt(
              globalTime,
              committedPrediction,
              this.#committedDuration,
              committed.lines,
              committed.startPoint,
            )
          : null;
    });
  }

  /** Where the robot would be at the point on the timeline the mouse hovers over. */
  #syncHoverPose() {
    $effect(() => {
      const hoverPercent = this.#hoverPercent.current;
      const prediction = this.timePrediction;
      if (hoverPercent === null || !prediction?.timeline || !this.#hasPath) {
        hoverRobotXYStore.set(null);
        hoverRobotHeadingStore.set(null);
        return;
      }
      const pose = robotPoseAt(
        (hoverPercent / 100) * this.effectiveDuration,
        prediction,
        this.#currentDuration,
        this.#lines.current,
        this.#startPoint.current,
      );
      hoverRobotXYStore.set({ x: pose.x, y: pose.y });
      hoverRobotHeadingStore.set(pose.heading);
    });
  }

  /**
   * The robot's pose `percent` of the way along the path. Inches by default;
   * pass the field's scales to get pixels.
   */
  poseAtPercent(
    percent: number,
    xScale: d3.ScaleLinear<number, number> = IDENTITY_SCALE,
    yScale: d3.ScaleLinear<number, number> = IDENTITY_SCALE,
  ) {
    return calculateRobotState(
      percent,
      this.timePrediction?.timeline ?? [],
      this.#lines.current,
      this.#startPoint.current,
      xScale,
      yScale,
    );
  }

  play = () => playingStore.set(true);
  pause = () => playingStore.set(false);

  reset = () => {
    this.controller?.reset();
    playingStore.set(false);
  };

  seek = (percent: number) => this.controller?.seekToPercent(percent);

  stepForward = () => this.#step(1);
  stepBackward = () => this.#step(-1);

  #step(delta: number) {
    const percent = Math.min(100, Math.max(0, this.#percent.current + delta));
    percentStore.set(percent);
    this.seek(percent);
  }
}
