// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Point, Line, Shape, SequenceItem, Settings } from "../types";
import { writable } from "svelte/store";
import { makeId } from "./nameGenerator";

export type AppState = {
  startPoint: Point;
  lines: Line[];
  shapes: Shape[];
  sequence: SequenceItem[];
  settings: Settings;
};

export type HistoryItem = {
  id: string;
  state: AppState;
  description: string;
  timestamp: number;
};

export type HistoryStoreItem = {
  item: HistoryItem;
  future: boolean;
};

export function createHistory(maxSize = 200) {
  // The last item of undoStack is the state the app is currently showing.
  const undoStack: HistoryItem[] = [];
  let redoStack: HistoryItem[] = [];
  let lastHash = "";

  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const undoDescriptionStore = writable<string | null>(null);
  const redoDescriptionStore = writable<string | null>(null);
  // Newest first: future (redo) entries, then the current and past entries.
  const historyStore = writable<HistoryStoreItem[]>([]);

  function canUndo() {
    // The oldest entry is the initial state, which can't be undone.
    return undoStack.length > 1;
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function updateStores() {
    canUndoStore.set(canUndo());
    canRedoStore.set(canRedo());
    undoDescriptionStore.set(
      canUndo() ? (undoStack.at(-1)?.description ?? null) : null,
    );
    redoDescriptionStore.set(redoStack.at(-1)?.description ?? null);

    historyStore.set([
      ...redoStack.map((item) => ({ item, future: true })),
      ...undoStack.toReversed().map((item) => ({ item, future: false })),
    ]);
  }

  // JSON is stable enough for detecting whether anything changed.
  function hash(state: AppState): string {
    return JSON.stringify(state);
  }

  function record(state: AppState, description: string = "Change") {
    const snapshot = structuredClone(state);
    const currentHash = hash(snapshot);
    if (currentHash === lastHash) return;

    undoStack.push({
      id: makeId(),
      state: snapshot,
      description,
      timestamp: Date.now(),
    });
    lastHash = currentHash;
    if (undoStack.length > maxSize) {
      undoStack.shift();
    }
    redoStack = [];
    updateStores();
  }

  function stepBack() {
    redoStack.push(undoStack.pop()!);
  }

  function stepForward() {
    undoStack.push(redoStack.pop()!);
  }

  // Call after moving through the stacks; returns the new current state.
  function settle(): AppState | null {
    const current = undoStack.at(-1);
    lastHash = current ? hash(current.state) : "";
    updateStores();
    return current ? structuredClone(current.state) : null;
  }

  function undo(): AppState | null {
    if (!canUndo()) return null;
    stepBack();
    return settle();
  }

  function redo(): AppState | null {
    if (!canRedo()) return null;
    stepForward();
    return settle();
  }

  function peek(): AppState | null {
    const current = undoStack.at(-1);
    return current ? structuredClone(current.state) : null;
  }

  /** Jumps directly to the history entry with the given id. */
  function restore(id: string): AppState | null {
    const isCurrent = () => undoStack.at(-1)?.id === id;

    if (undoStack.some((item) => item.id === id)) {
      while (!isCurrent()) stepBack();
      return settle();
    }
    if (redoStack.some((item) => item.id === id)) {
      while (!isCurrent()) stepForward();
      return settle();
    }
    return null;
  }

  return {
    record,
    undo,
    redo,
    canUndo,
    canRedo,
    peek,
    canUndoStore,
    canRedoStore,
    undoDescriptionStore,
    redoDescriptionStore,
    historyStore,
    restore,
  };
}
