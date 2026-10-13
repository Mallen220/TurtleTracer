// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/svelte";
import FileList from "../lib/components/filemanager/FileList.svelte";
import FileGrid from "../lib/components/filemanager/FileGrid.svelte";
import type { FileInfo } from "../types";

beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const modified = new Date("2026-10-01T12:00:00");
const files: FileInfo[] = [
  { name: "Far.pp", path: "/p/Far.pp", size: 10, modified },
  { name: "Far.turt", path: "/p/Far.turt", size: 10, modified },
  { name: "Old.PP", path: "/p/Old.PP", size: 10, modified },
  {
    name: "Robot.pp",
    path: "/p/Robot.pp",
    size: 0,
    modified,
    isDirectory: true,
  },
];

describe.each([
  ["list", FileList],
  ["grid", FileGrid],
])("the %s view", (_, View) => {
  it("tags .pp projects so they can be told from the .turt saved from them", () => {
    render(View, { files, sortMode: "name" });
    const tagged = (name: string) =>
      within(screen.getByRole("button", { name })).queryByText(".pp");
    expect(tagged("Far.pp")).toBeInTheDocument();
    expect(tagged("Old.PP")).toBeInTheDocument();
    expect(tagged("Far.turt")).toBeNull();
    // A folder named like a project isn't one.
    expect(tagged("Robot.pp")).toBeNull();
  });

  it("explains what the tag means", () => {
    render(View, { files: [files[0]!], sortMode: "name" });
    expect(screen.getByText(".pp")).toHaveAttribute(
      "title",
      expect.stringContaining("Saving it makes a .turt copy"),
    );
  });
});
