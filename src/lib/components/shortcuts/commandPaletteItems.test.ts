// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
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
