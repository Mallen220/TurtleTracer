// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { dismissOpenDialog, deselectAllElements } from "./dialogDismissal";
import {
  showSettings,
  showFileManager,
  selectedPointId,
  multiSelectedPointIds,
  selectedLineId,
  multiSelectedLineIds,
} from "../../../stores";
import { get } from "svelte/store";

describe("dialogDismissal", () => {
  beforeEach(() => {
    showSettings.set(false);
    showFileManager.set(false);
    selectedPointId.set(null);
    multiSelectedPointIds.set([]);
    selectedLineId.set(null);
    multiSelectedLineIds.set([]);
  });

  it("dismisses open dialog and returns true", () => {
    showSettings.set(true);
    const dismissed = dismissOpenDialog();
    expect(dismissed).toBe(true);
    expect(get(showSettings)).toBe(false);
  });

  it("returns false if no dialog is open", () => {
    const dismissed = dismissOpenDialog();
    expect(dismissed).toBe(false);
  });

  it("deselects all points and lines", () => {
    selectedPointId.set("point-1-0");
    multiSelectedPointIds.set(["point-1-0", "point-1-1"]);
    selectedLineId.set("line-1");
    multiSelectedLineIds.set(["line-1"]);

    deselectAllElements();

    expect(get(selectedPointId)).toBeNull();
    expect(get(multiSelectedPointIds)).toEqual([]);
    expect(get(selectedLineId)).toBeNull();
    expect(get(multiSelectedLineIds)).toEqual([]);
  });
});
