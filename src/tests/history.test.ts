// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { createHistory, type AppState } from "../utils/history";

// Mocking the parts of AppState needed for testing
const defaultState: AppState = {
  startPoint: { x: 0, y: 0 },
  lines: [],
  shapes: [],
  sequence: [],
  settings: {
    unit: "inches",
  } as any,
};

describe("createHistory", () => {
  let history: ReturnType<typeof createHistory>;

  beforeEach(() => {
    history = createHistory(5); // Small max size for testing
  });

  it("initializes with empty stacks", () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(get(history.canUndoStore)).toBe(false);
    expect(get(history.canRedoStore)).toBe(false);
    expect(history.peek()).toBeNull();
  });

  it("records a state", () => {
    const state1 = { ...defaultState, startPoint: { x: 10, y: 10 } };
    history.record(state1);

    expect(history.canUndo()).toBe(false); // Only 1 state, need > 1 to undo
    expect(history.peek()).toEqual(state1);

    // Record another
    const state2 = { ...defaultState, startPoint: { x: 20, y: 20 } };
    history.record(state2);

    expect(history.canUndo()).toBe(true);
    expect(history.peek()).toEqual(state2);
    expect(get(history.canUndoStore)).toBe(true);
  });

  it("ignores duplicate states", () => {
    const state1 = { ...defaultState, startPoint: { x: 10, y: 10 } };
    history.record(state1);
    history.record(state1); // Duplicate

    // Let's verify by adding a distinct state, then duplicate
    const state2 = { ...defaultState, startPoint: { x: 20, y: 20 } };
    history.record(state2);
    history.record(state2);

    expect(history.canUndo()).toBe(true);
    history.undo();
    // If duplicate was ignored, we should be back at state1
    expect(history.peek()).toEqual(state1);
  });

  it("undo restores previous state", () => {
    const state1 = { ...defaultState, startPoint: { x: 10, y: 10 } };
    const state2 = { ...defaultState, startPoint: { x: 20, y: 20 } };

    history.record(state1);
    history.record(state2);

    const restored = history.undo();
    expect(restored).toEqual(state1);
    expect(history.peek()).toEqual(state1);
    expect(history.canUndo()).toBe(false); // Back to 1 state
    expect(history.canRedo()).toBe(true);
    expect(get(history.canRedoStore)).toBe(true);
  });

  it("redo restores next state", () => {
    const state1 = { ...defaultState, startPoint: { x: 10, y: 10 } };
    const state2 = { ...defaultState, startPoint: { x: 20, y: 20 } };

    history.record(state1);
    history.record(state2);
    history.undo();

    const redoState = history.redo();
    expect(redoState).toEqual(state2);
    expect(history.peek()).toEqual(state2);
    expect(history.canRedo()).toBe(false);
  });

  it("clears redo stack on new record", () => {
    const state1 = { ...defaultState, startPoint: { x: 10, y: 10 } };
    const state2 = { ...defaultState, startPoint: { x: 20, y: 20 } };
    const state3 = { ...defaultState, startPoint: { x: 30, y: 30 } };

    history.record(state1);
    history.record(state2);
    history.undo(); // Back to state1, redo stack has state2

    expect(history.canRedo()).toBe(true);

    history.record(state3); // Should clear redo stack

    expect(history.canRedo()).toBe(false);
    expect(get(history.canRedoStore)).toBe(false);

    // Undo should go to state1
    expect(history.undo()).toEqual(state1);
  });

  it("respects max size", () => {
    // History initialized with size 5
    // Add 6 states
    for (let i = 0; i < 6; i++) {
      history.record({ ...defaultState, startPoint: { x: i, y: 0 } });
    }

    // Stack should have 5 items: 1, 2, 3, 4, 5. (0 was shifted out)
    // canUndo() checks if length > 1.

    // Let's undo 4 times to get to the bottom
    // 5 -> 4
    expect(history.undo()).toEqual({
      ...defaultState,
      startPoint: { x: 4, y: 0 },
    });
    // 4 -> 3
    expect(history.undo()).toEqual({
      ...defaultState,
      startPoint: { x: 3, y: 0 },
    });
    // 3 -> 2
    expect(history.undo()).toEqual({
      ...defaultState,
      startPoint: { x: 2, y: 0 },
    });
    // 2 -> 1
    expect(history.undo()).toEqual({
      ...defaultState,
      startPoint: { x: 1, y: 0 },
    });

    // Now at state 1. Stack has [state1]. length is 1. canUndo should be false.
    expect(history.canUndo()).toBe(false);
    expect(history.peek()).toEqual({
      ...defaultState,
      startPoint: { x: 1, y: 0 },
    });
  });

  it("deep clones state on record and return", () => {
    const mutableState = { ...defaultState, startPoint: { x: 10, y: 10 } };
    history.record(mutableState);

    // Modify original object
    mutableState.startPoint.x = 999;

    // History should not be affected
    expect(history.peek()?.startPoint.x).toBe(10);

    // Modify returned object
    const retrieved = history.peek()!;
    retrieved.startPoint.x = 888;

    expect(history.peek()?.startPoint.x).toBe(10);
  });
});
