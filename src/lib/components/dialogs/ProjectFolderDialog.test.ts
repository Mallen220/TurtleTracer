// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import ProjectFolderDialog from "./ProjectFolderDialog.svelte";
import { projectFolderPrompt } from "../../../stores";
import { saveAutoPathsDirectory } from "../../../utils/directorySettings";

vi.mock("../../../utils/directorySettings", () => ({
  saveAutoPathsDirectory: vi.fn(),
}));

describe("ProjectFolderDialog", () => {
  const answer = vi.fn();

  beforeEach(() => {
    answer.mockClear();
    vi.mocked(saveAutoPathsDirectory).mockClear();
    projectFolderPrompt.set(answer);
  });

  afterEach(() => {
    projectFolderPrompt.set(null);
    delete (globalThis as any).electronAPI;
  });

  it("is hidden until a save asks for a folder", async () => {
    projectFolderPrompt.set(null);
    const { queryByRole } = render(ProjectFolderDialog);
    expect(queryByRole("dialog")).toBeNull();

    projectFolderPrompt.set(answer);
    await tick();
    expect(queryByRole("dialog")).toBeInTheDocument();
  });

  it("recommends the usual FTC folder", () => {
    const { getByText } = render(ProjectFolderDialog);
    expect(
      getByText("TeamCode/src/main/assets/AutoPaths/"),
    ).toBeInTheDocument();
  });

  it("remembers and returns the folder the user picks", async () => {
    const setDirectory = vi.fn().mockResolvedValue("/code/AutoPaths");
    (globalThis as any).electronAPI = { setDirectory };
    const { getByText } = render(ProjectFolderDialog);

    await fireEvent.click(getByText(/Select Directory/i));

    await vi.waitFor(() =>
      expect(answer).toHaveBeenCalledWith({ folder: "/code/AutoPaths" }),
    );
    expect(saveAutoPathsDirectory).toHaveBeenCalledWith("/code/AutoPaths");
  });

  it("stays open if the folder picker is dismissed", async () => {
    (globalThis as any).electronAPI = {
      setDirectory: vi.fn().mockResolvedValue(null),
    };
    const { getByText } = render(ProjectFolderDialog);

    await fireEvent.click(getByText(/Select Directory/i));
    await tick();

    expect(answer).not.toHaveBeenCalled();
  });

  it("offers only choosing a folder or cancelling", async () => {
    const { getByText, getAllByRole } = render(ProjectFolderDialog);
    expect(getAllByRole("button").map((b) => b.textContent?.trim())).toEqual([
      "Cancel",
      "Select Directory...",
    ]);

    await fireEvent.click(getByText("Cancel"));
    expect(answer).toHaveBeenLastCalledWith("cancel");
  });

  it("cancels on Escape", async () => {
    render(ProjectFolderDialog);
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(answer).toHaveBeenCalledWith("cancel");
  });
});
