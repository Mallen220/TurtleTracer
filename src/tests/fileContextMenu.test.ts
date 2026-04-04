// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/svelte";
import FileContextMenu from "../lib/components/filemanager/FileContextMenu.svelte";
import { tick } from "svelte";

describe("FileContextMenu", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(window, "innerHeight", {
      writable: true,
      configurable: true,
      value: 1000,
    });
  });

  it("updates fileName correctly", async () => {
    const { component, rerender } = render(FileContextMenu, {
      x: 0,
      y: 0,
      fileName: "file1.txt",
      isDirectory: false,
    });

    expect(screen.getByText("file1.txt")).toBeTruthy();

    await rerender({
      x: 0,
      y: 0,
      fileName: "file2.txt",
      isDirectory: false,
    });

    expect(screen.getByText("file2.txt")).toBeTruthy();
  });

  it("updates position correctly when going off screen", async () => {
    const { component, rerender } = render(FileContextMenu, {
      x: 900,
      y: 900,
      fileName: "file1.txt",
      isDirectory: false,
    });

    const menuNode = screen.getByRole("menu");
    menuNode.getBoundingClientRect = vi.fn(
      () =>
        ({
          width: 200,
          height: 200,
          top: 0,
          left: 0,
          right: 200,
          bottom: 200,
          x: 0,
          y: 0,
          toJSON: () => {},
        }) as any,
    );

    // Let effect run
    await tick();
    await tick();

    expect(menuNode.style.left).toBe("700px");
    expect(menuNode.style.top).toBe("700px");

    await rerender({
      x: 100,
      y: 100,
      fileName: "file1.txt",
      isDirectory: false,
    });

    await tick();
    await tick();

    expect(menuNode.style.left).toBe("100px");
    expect(menuNode.style.top).toBe("100px");
  });
});
