// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import type { Point, Line, Shape, SequenceItem, Settings } from "../types";
import { writable } from "svelte/store";

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

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function createHistory(maxSize = 200) {
  let undoStack: HistoryItem[] = [];
  let redoStack: HistoryItem[] = [];
  let lastHash = "";

  // Create writable stores to trigger reactivity
  const canUndoStore = writable(false);
  const canRedoStore = writable(false);
  const historyStore = writable<HistoryStoreItem[]>([]);

  function updateStores() {
    canUndoStore.set(undoStack.length > 1);
    canRedoStore.set(redoStack.length > 0);

    // Construct history list: Newest First
    // redoStack contains future items. Top of stack is nearest future.
    // If we undo A->B->C. undo=[A, B], redo=[C].
    // If we undo B->A. undo=[A], redo=[C, B].
    // We want to show C (newest), B, A (oldest).
    // redoStack is [C, B]. So we take it as is.
    // undoStack is [A]. We reverse it (though with 1 item it's same).
    // If undoStack was [A, B], we want B then A. So reverse.

    const futureItems = redoStack.map((item) => ({
      item,
      future: true,
    }));

    const pastItems = undoStack
      .slice()
      .reverse()
      .map((item) => ({
        item,
        future: false,
      }));

    historyStore.set([...futureItems, ...pastItems]);
  }

  function hash(state: AppState): string {
    // Stable hash via JSON string; sufficient for change detection here
    return JSON.stringify(state);
  }

  function record(state: AppState, description: string = "Change") {
    const snapshot = deepClone(state);
    const currentHash = hash(snapshot);
    if (currentHash === lastHash) {
      // No meaningful change
      return;
    }
    const item: HistoryItem = {
      id: Math.random().toString(36).substring(2, 11),
      state: snapshot,
      description,
      timestamp: Date.now(),
    };
    undoStack.push(item);
    lastHash = currentHash;
    // Cap stack size
    if (undoStack.length > maxSize) {
      undoStack.shift();
    }
    // Clear redo on new action
    redoStack = [];
    updateStores();
  }

  function canUndo() {
    return undoStack.length > 1; // keep initial state; require at least one prior state
  }

  function canRedo() {
    return redoStack.length > 0;
  }

  function undo(): AppState | null {
    if (!canUndo()) return null;
    const current = undoStack.pop()!; // current state to redo
    const prev = undoStack[undoStack.length - 1];
    redoStack.push(current);
    lastHash = hash(prev.state);
    updateStores();
    return deepClone(prev.state);
  }

  function redo(): AppState | null {
    if (!canRedo()) return null;
    const next = redoStack.pop()!;
    undoStack.push(next);
    lastHash = hash(next.state);
    updateStores();
    return deepClone(next.state);
  }

  function peek(): AppState | null {
    if (undoStack.length === 0) return null;
    return deepClone(undoStack[undoStack.length - 1].state);
  }

  function restore(id: string): AppState | null {
    // Check if id is in undoStack (current or past)
    const undoIndex = undoStack.findIndex((item) => item.id === id);
    if (undoIndex !== -1) {
      // It's in the past (or current).
      // We want to undo until we are at this index.
      // Currently at length-1.
      while (undoStack.length - 1 > undoIndex) {
        undo();
      }
      return peek();
    }

    // Check if id is in redoStack (future)
    const redoIndex = redoStack.findIndex((item) => item.id === id);
    if (redoIndex !== -1) {
      // Redo until we reach it
      let safety = redoStack.length + 1;
      while (safety-- > 0 && canRedo()) {
        redo();
        // Check if we reached the desired state (it is now at top of undoStack)
        if (undoStack[undoStack.length - 1].id === id) break;
      }
      return peek();
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
    historyStore,
    restore,
  };
}
