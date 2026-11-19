// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import FileContextMenu from "../lib/components/filemanager/FileContextMenu.svelte";
import { tick } from "svelte";
import { setupUIViewport } from "./testUtils";

describe("FileContextMenu", () => {
  beforeEach(() => {
    setupUIViewport();
  });

  it("updates fileName correctly", async () => {
    const { rerender } = render(FileContextMenu as any, {
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
    const { testMenuOffScreenPositioning } = await import("./testUtils");
    await testMenuOffScreenPositioning(
      { x: 900, y: 900, fileName: "file1.txt", isDirectory: false },
      { x: 100, y: 100, fileName: "file1.txt", isDirectory: false },
      tick,
      screen,
      expect,
      (props: any) => render(FileContextMenu as any, props),
    );
  });

  describe("Export", () => {
    const menu = (fileName: string, extra: object = {}) =>
      render(FileContextMenu as any, {
        x: 0,
        y: 0,
        fileName,
        isDirectory: false,
        ...extra,
      });

    it("is offered on project files only", () => {
      for (const name of ["a.turt", "a.pp"]) {
        const { unmount } = menu(name);
        expect(screen.queryByText("Export")).toBeTruthy();
        unmount();
      }
      for (const name of ["a.java", "a.kt", "a.txt"]) {
        const { unmount } = menu(name);
        expect(screen.queryByText("Export")).toBeNull();
        unmount();
      }
      menu("folder.turt", { isDirectory: true });
      expect(screen.queryByText("Export")).toBeNull();
    });

    it("lists every export format and reports the chosen one", async () => {
      const onaction = vi.fn();
      menu("a.turt", { onaction });
      expect(screen.queryByText("Strategy Sheet")).toBeNull();

      await fireEvent.mouseEnter(screen.getByText("Export").parentElement!);
      for (const label of [
        "Java Code",
        "Kotlin Code",
        "Points Array",
        "Sequential Command",
        ".turt File",
        "Export as Image",
        "Export Animated",
        "Strategy Sheet",
      ]) {
        expect(screen.getByText(label)).toBeTruthy();
      }

      await fireEvent.click(screen.getByText("Export as Image"));
      expect(onaction).toHaveBeenCalledWith("export:image");
    });
  });
});
