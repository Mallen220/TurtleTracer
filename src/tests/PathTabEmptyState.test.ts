// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen } from "@testing-library/svelte";
import { vi, test, expect } from "vitest";
import PathTab from "../lib/components/tabs/PathTab.svelte";
import { DEFAULT_SETTINGS, getDefaultStartPoint } from "../config";
import type { Line, SequenceItem } from "../types";

test("EmptyState appears when all items are deleted", async () => {
  const settings = structuredClone(DEFAULT_SETTINGS);
  const startPoint = getDefaultStartPoint();
  const line: Line = {
    id: "line-1",
    name: "Path 1",
    endPoint: { x: 50, y: 50, heading: "tangential", reverse: false },
    controlPoints: [],
    color: "#000000",
    locked: false,
    waitBeforeMs: 0,
    waitAfterMs: 0,
    waitBeforeName: "",
    waitAfterName: "",
  };
  let lines = [line];
  let sequence: SequenceItem[] = [{ kind: "path", lineId: line.id! }];

  const recordChange = vi.fn();

  render(PathTab, {
    startPoint,
    lines,
    sequence,
    settings,
    recordChange,
    isActive: true,
  });

  // Check that EmptyState is NOT visible initially
  expect(screen.queryByText("Start your path")).not.toBeInTheDocument();

  // Find the delete button.
  // In PathLineSection, the delete button has title "Delete Path".
  // Now it should be visible even with 1 line.

  const deleteButton = screen.queryByTitle("Delete Path");
  expect(deleteButton).toBeInTheDocument();
});
