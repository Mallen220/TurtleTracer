// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import ExportCycleActions from "../lib/components/dialogs/ExportCycleActions.svelte";
import { exportCycle } from "../stores";

const files = ["a", "b", "c"].map((n) => ({
  name: `${n}.turt`,
  path: `/${n}`,
}));
const label = createRawSnippet(() => ({
  render: () => "<span>Save to File</span>",
}));
const show = (index: number, props: object = {}) => {
  exportCycle.set({ files, index });
  const onaction = vi.fn();
  const onclose = vi.fn();
  render(ExportCycleActions as any, {
    exporter: vi.fn(),
    onclose,
    onaction,
    children: label,
    ...props,
  });
  return { onaction, onclose };
};

describe("ExportCycleActions", () => {
  beforeEach(() => exportCycle.set(null));

  it("offers Cancel all, Export All with the files left, and the save button", async () => {
    const { onaction } = show(1);
    expect(screen.getByText("Cancel all")).toBeTruthy();
    expect(screen.getByText("Export All (2)")).toBeTruthy(); // this file and the last
    await fireEvent.click(screen.getByText("Save to File"));
    expect(onaction).toHaveBeenCalled();
  });

  it("has no Export All on the last file", () => {
    show(2);
    expect(screen.queryByText(/Export All/)).toBeNull();
    expect(screen.getByText("Save to File")).toBeTruthy();
  });
});
