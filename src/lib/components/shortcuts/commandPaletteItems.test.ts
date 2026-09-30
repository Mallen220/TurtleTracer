// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import { selectedLineId, selectedPointId } from "../../../stores";
import {
  generateLineCommands,
  generateWaitCommands,
  generateRotateCommands,
  generateEventCommands,
  generateKeybindingCommands,
} from "./commandPaletteItems";
import type { Line, SequenceItem, KeyBinding } from "../../../types";

describe("commandPaletteItems", () => {
  it("generates line commands and scrolls when executed", () => {
    const lines: Line[] = [
      {
        id: "line-1",
        name: "First Segment",
        color: "#f00",
        endPoint: { x: 10, y: 10, heading: "tangential" },
        controlPoints: [],
      },
    ];
    const scrollToItem = vi.fn();
    const cmds = generateLineCommands(lines, { scrollToItem });

    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("cmd-line-line-1");
    expect(cmds[0].label).toBe("Path: First Segment");
    expect(cmds[0].category).toBe("Path Segment");

    cmds[0].action();
    expect(scrollToItem).toHaveBeenCalledWith("path", "line-1");
  });

  it("generates wait commands", () => {
    const seq: SequenceItem[] = [
      {
        kind: "wait",
        id: "wait-1",
        name: "Intake Wait",
        durationMs: 500,
      } as SequenceItem,
    ];
    const scrollToItem = vi.fn();
    const cmds = generateWaitCommands(seq, { scrollToItem });

    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("cmd-wait-wait-1");
    expect(cmds[0].label).toBe("Wait: Intake Wait");

    cmds[0].action();
    expect(scrollToItem).toHaveBeenCalledWith("wait", "wait-1");
  });

  it("generates rotate commands", () => {
    const seq: SequenceItem[] = [
      {
        kind: "rotate",
        id: "rot-1",
        name: "Turn to Basket",
        degrees: 90,
      } as SequenceItem,
    ];
    const scrollToItem = vi.fn();
    const cmds = generateRotateCommands(seq, { scrollToItem });

    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("cmd-rotate-rot-1");
    expect(cmds[0].label).toBe("Rotate: Turn to Basket");

    cmds[0].action();
    expect(scrollToItem).toHaveBeenCalledWith("rotate", "rot-1");
  });

  it("generates event commands from lines and sequence items", () => {
    const lines: Line[] = [
      {
        id: "l1",
        color: "#00f",
        endPoint: { x: 0, y: 0, heading: "tangential" },
        controlPoints: [],
        eventMarkers: [
          {
            id: "em1",
            name: "Outtake",
            position: 0.5,
            type: "pose",
            poseX: 0,
            poseY: 0,
          },
        ],
      },
    ];
    const seq: SequenceItem[] = [
      {
        kind: "wait",
        id: "w1",
        durationMs: 1000,
        eventMarkers: [
          {
            id: "em2",
            name: "Trigger Claw",
          },
        ],
      } as any,
    ];

    const scrollToItem = vi.fn();
    const cmds = generateEventCommands(lines, seq, { scrollToItem });

    expect(cmds).toHaveLength(2);
    expect(cmds[0].id).toBe("cmd-event-em1");
    expect(cmds[0].label).toBe("Event: Outtake");
    expect(cmds[1].id).toBe("cmd-event-em2");
    expect(cmds[1].label).toBe("Event: Trigger Claw");

    cmds[0].action();
    expect(scrollToItem).toHaveBeenCalledWith("event", "em1");
  });

  it("generates keybinding commands matching available actions", () => {
    const keyBindings: KeyBinding[] = [
      {
        id: "save",
        action: "saveProject",
        key: "mod+s",
        description: "Save Project",
        category: "File",
      },
      {
        id: "unknown",
        action: "unregisteredAction",
        key: "mod+u",
        description: "Unregistered",
        category: "Unknown",
      },
    ];

    const saveAction = vi.fn();
    const cmds = generateKeybindingCommands(keyBindings, {
      saveProject: saveAction,
    });

    expect(cmds).toHaveLength(1);
    expect(cmds[0].id).toBe("save");
    expect(cmds[0].label).toBe("Save Project");
    expect(cmds[0].shortcut).toBe("mod+s");

    cmds[0].action();
    expect(saveAction).toHaveBeenCalled();
  });
});

describe("commandPaletteItems selection and labels", () => {
  const line = (id: string, name?: string): Line => ({
    id,
    name,
    color: "#f00",
    endPoint: { x: 0, y: 0, heading: "tangential" },
    controlPoints: [],
  });

  beforeEach(() => {
    selectedLineId.set(null);
    selectedPointId.set(null);
  });

  it("numbers paths that have no name", () => {
    const cmds = generateLineCommands([
      line("a", "Named"),
      line("b"),
      line("c", ""),
    ]);
    expect(cmds.map((c) => c.label)).toEqual([
      "Path: Named",
      "Path 2",
      "Path 3",
    ]);
  });

  it("selects a path and its end point, even without a control tab to scroll", () => {
    const cmds = generateLineCommands([line("a"), line("b")], null);
    cmds[1].action();
    expect(get(selectedLineId)).toBe("b");
    expect(get(selectedPointId)).toBe("point-2-0");
  });

  it("selects a wait or rotation and clears any selected path", () => {
    selectedLineId.set("a");
    const seq = [
      { kind: "wait", id: "w1", durationMs: 1 },
      { kind: "rotate", id: "r1", degrees: 1 },
    ] as SequenceItem[];
    const [wait] = generateWaitCommands(seq);
    const [rotate] = generateRotateCommands(seq);
    expect(wait.label).toBe("Wait");
    expect(rotate.label).toBe("Rotate");

    wait.action();
    expect(get(selectedPointId)).toBe("wait-w1");
    expect(get(selectedLineId)).toBeNull();

    selectedLineId.set("a");
    rotate.action();
    expect(get(selectedPointId)).toBe("rotate-r1");
    expect(get(selectedLineId)).toBeNull();
  });

  it("only lists waits as waits and rotations as rotations", () => {
    const seq = [
      { kind: "wait", id: "w1", durationMs: 1 },
      { kind: "rotate", id: "r1", degrees: 1 },
      { kind: "path", lineId: "a" },
    ] as SequenceItem[];
    expect(generateWaitCommands(seq).map((c) => c.id)).toEqual(["cmd-wait-w1"]);
    expect(generateRotateCommands(seq).map((c) => c.id)).toEqual([
      "cmd-rotate-r1",
    ]);
  });

  it("labels unnamed event markers by where they are", () => {
    const lines: Line[] = [
      line("a"),
      { ...line("b"), eventMarkers: [{ id: "e1", position: 0.1 } as any] },
    ];
    const seq = [
      { kind: "wait", id: "w", durationMs: 1, eventMarkers: [{ id: "e2" }] },
      { kind: "rotate", id: "r", degrees: 1, eventMarkers: [{ id: "e3" }] },
      { kind: "path", lineId: "a", eventMarkers: [{ id: "e4" }] },
    ] as any[];
    const labels = generateEventCommands(lines, seq).map((c) => c.label);
    // Markers on paths come first, then those on waits and rotations; markers
    // listed on a path step are not counted a second time.
    expect(labels).toEqual([
      "Event (Path 2)",
      "Event (Wait)",
      "Event (Rotate)",
    ]);
  });

  it("works without a control tab to scroll", () => {
    const lines: Line[] = [
      {
        ...line("a"),
        eventMarkers: [{ id: "e1", name: "x", position: 0 } as any],
      },
    ];
    expect(() => generateEventCommands(lines, [])[0].action()).not.toThrow();
    expect(() =>
      generateWaitCommands([{ kind: "wait", id: "w" } as any])[0].action(),
    ).not.toThrow();
  });

  it("passes each key binding's shortcut and category to its command", () => {
    const run = vi.fn();
    const [cmd] = generateKeybindingCommands(
      [
        {
          id: "k",
          action: "go",
          key: "ctrl+g",
          description: "Go",
          category: "Nav",
        } as KeyBinding,
      ],
      { go: run, other: undefined },
    );
    expect(cmd).toMatchObject({
      id: "k",
      label: "Go",
      shortcut: "ctrl+g",
      category: "Nav",
    });
    cmd.action();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
