// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { render, fireEvent, screen } from "@testing-library/svelte";
import { describe, it, expect, vi } from "vitest";
import PlaybackControls from "../lib/components/PlaybackControls.svelte";

describe("PlaybackControls", () => {
  it("renders play button when paused", async () => {
    const play = vi.fn();
    render(PlaybackControls, {
      props: {
        playing: false,
        play,
        pause: vi.fn(),
        percent: 0,
        handleSeek: vi.fn(),
        loopAnimation: false,
        timelineItems: [],
        playbackSpeed: 1,
        setPlaybackSpeed: vi.fn(),
      },
    });

    const btn = screen.getByLabelText("Play animation");
    expect(btn).toBeInTheDocument();

    await fireEvent.click(btn);
    expect(play).toHaveBeenCalled();
  });

  it("renders pause button when playing", async () => {
    const pause = vi.fn();
    render(PlaybackControls, {
      props: {
        playing: true,
        play: vi.fn(),
        pause,
        percent: 0,
        handleSeek: vi.fn(),
        loopAnimation: false,
        timelineItems: [],
        playbackSpeed: 1,
        setPlaybackSpeed: vi.fn(),
      },
    });

    const btn = screen.getByLabelText("Pause animation");
    expect(btn).toBeInTheDocument();

    await fireEvent.click(btn);
    expect(pause).toHaveBeenCalled();
  });

  it("toggles loop animation", async () => {
    const { component } = render(PlaybackControls, {
      props: {
        playing: false,
        play: vi.fn(),
        pause: vi.fn(),
        percent: 0,
        handleSeek: vi.fn(),
        loopAnimation: false,
        timelineItems: [],
        playbackSpeed: 1,
        setPlaybackSpeed: vi.fn(),
      },
    });

    const loopBtn = screen.getByLabelText("Loop animation");
    expect(loopBtn).toBeInTheDocument();
    expect(loopBtn).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(loopBtn);

    expect(loopBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("changes playback speed", async () => {
    const setPlaybackSpeed = vi.fn();
    render(PlaybackControls, {
      props: {
        playing: false,
        play: vi.fn(),
        pause: vi.fn(),
        percent: 0,
        handleSeek: vi.fn(),
        loopAnimation: false,
        timelineItems: [],
        playbackSpeed: 1.0,
        setPlaybackSpeed,
      },
    });

    const speedBtn = screen.getByLabelText("Playback speed options");
    await fireEvent.click(speedBtn);

    const speedOption = screen.getByText("2.00x");
    await fireEvent.click(speedOption);

    expect(setPlaybackSpeed).toHaveBeenCalledWith(2.0, true);
  });

  it("seeks when slider changes", async () => {
    const handleSeek = vi.fn();
    render(PlaybackControls, {
      props: {
        playing: false,
        play: vi.fn(),
        pause: vi.fn(),
        percent: 0,
        handleSeek,
        loopAnimation: false,
        timelineItems: [],
        playbackSpeed: 1.0,
        setPlaybackSpeed: vi.fn(),
      },
    });

    const slider = screen.getByLabelText("Animation progress");
    await fireEvent.input(slider, { target: { value: "50" } });

    expect(handleSeek).toHaveBeenCalledWith(50);
  });

  it("renders timeline items", () => {
    const timelineItems = [
      { type: "marker", percent: 25, name: "Marker 1", color: "red" },
      { type: "dot", percent: 75, name: "Dot 1", color: "blue" },
    ];

    render(PlaybackControls, {
      props: {
        playing: false,
        play: vi.fn(),
        pause: vi.fn(),
        percent: 0,
        handleSeek: vi.fn(),
        loopAnimation: false,
        timelineItems: timelineItems as any[],
        playbackSpeed: 1.0,
        setPlaybackSpeed: vi.fn(),
      },
    });

    expect(screen.getByLabelText("Marker 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Dot 1")).toBeInTheDocument();
  });
});
