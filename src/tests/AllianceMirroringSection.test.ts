// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The Field tab's Alliance Selection & Path Mirroring section: this project's alliance, whether it
// mirrors to the other alliance, and a preview of the mirrored path.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { get } from "svelte/store";
import AllianceMirroringSection from "../lib/components/sections/AllianceMirroringSection.svelte";
import {
  extraDataStore,
  mirrorPreviewStore,
  settingsStore,
} from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";

function mount() {
  const recordChange = vi.fn();
  render(AllianceMirroringSection, { recordChange });
  return { recordChange };
}

const radio = (name: string) => screen.getByRole("radio", { name });
const mirrorBox = () => screen.getByRole("checkbox") as HTMLInputElement;

beforeEach(() => {
  settingsStore.set({ ...DEFAULT_SETTINGS });
  extraDataStore.set({ strategyNotes: "keep me" });
  mirrorPreviewStore.set(false);
});

describe("drawn for", () => {
  it("is NONE by default, so exports don't need TurtleTracerLib", () => {
    mount();
    expect(screen.getByTestId("drawn-for-value")).toHaveTextContent("NONE");
    expect(radio("Red")).toHaveAttribute("aria-checked", "false");
    expect(radio("Blue")).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(
      screen.getByText(/doesn't use\s+TurtleTracerLib/),
    ).toBeInTheDocument();
  });

  it("offers mirroring, not yet on, once an alliance is picked", async () => {
    mount();
    await fireEvent.click(radio("Red"));
    expect(radio("Red")).toHaveAttribute("aria-checked", "true");
    expect(mirrorBox().checked).toBe(false);
    expect(screen.getByText("Mirror to Blue")).toBeInTheDocument();
    // Not mirrored, but the auto still says which alliance it's for.
    expect(screen.getByText("AutoSelection.alliance()")).toBeInTheDocument();
    // Nothing to preview until the path mirrors.
    expect(screen.queryByRole("button", { name: /Preview/ })).toBeNull();
  });

  it("is saved with this project and recorded as an edit", async () => {
    const { recordChange } = mount();
    await fireEvent.click(radio("Blue"));
    expect(get(extraDataStore)).toEqual({
      strategyNotes: "keep me",
      allianceMirroring: { drawnFor: "BLUE", mirror: false },
    });
    expect(recordChange).toHaveBeenCalledWith("Drawn For Alliance");
    expect(screen.getByText("Mirror to Red")).toBeInTheDocument();

    // Cleared back to the default (NONE): nothing is left in the project.
    await fireEvent.click(radio("Blue"));
    expect(get(extraDataStore)).toEqual({ strategyNotes: "keep me" });
  });

  it("shows the side a project already has", () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "BLUE", mirror: true },
    });
    mount();
    expect(radio("Blue")).toHaveAttribute("aria-checked", "true");
    expect(mirrorBox().checked).toBe(true);
  });
});

describe("clearing the alliance", () => {
  it("reads NONE when the picked alliance is clicked again, and sets nothing", async () => {
    extraDataStore.set({
      strategyNotes: "keep me",
      allianceMirroring: { drawnFor: "RED", mirror: false },
    });
    const { recordChange } = mount();
    expect(screen.getByTestId("drawn-for-value")).toHaveTextContent("RED");

    await fireEvent.click(radio("Red"));
    expect(screen.getByTestId("drawn-for-value")).toHaveTextContent("NONE");
    expect(radio("Red")).toHaveAttribute("aria-checked", "false");
    expect(radio("Blue")).toHaveAttribute("aria-checked", "false");
    expect(get(extraDataStore)).toEqual({ strategyNotes: "keep me" });
    expect(recordChange).toHaveBeenCalledWith("Drawn For Alliance");
    // Nothing to mirror from, so no mirroring or preview.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Preview/ })).toBeNull();
    expect(screen.getByText(/No alliance is set/)).toBeInTheDocument();
  });

  it("clears mirroring and the preview along with the alliance", async () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "BLUE", mirror: true },
    });
    mirrorPreviewStore.set(true);
    mount();
    await fireEvent.click(radio("Blue"));
    expect(get(extraDataStore).allianceMirroring).toBeUndefined();
    expect(get(mirrorPreviewStore)).toBe(false);
  });

  it("can pick an alliance again after clearing it", async () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "NONE", mirror: false },
    });
    mount();
    expect(screen.getByTestId("drawn-for-value")).toHaveTextContent("NONE");
    await fireEvent.click(radio("Blue"));
    expect(screen.getByTestId("drawn-for-value")).toHaveTextContent("BLUE");
    expect(screen.getByText("Mirror to Red")).toBeInTheDocument();
  });
});

describe("mirroring", () => {
  it("is turned on per project, and says how to add the auto", async () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "RED", mirror: false },
    });
    const { recordChange } = mount();
    await fireEvent.click(mirrorBox());
    expect(get(extraDataStore).allianceMirroring).toEqual({
      drawnFor: "RED",
      mirror: true,
    });
    expect(recordChange).toHaveBeenCalledWith("Alliance Mirroring");
    expect(screen.getByText("Alliance.RED")).toBeInTheDocument();
  });

  it("can be previewed on the other alliance", async () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "RED", mirror: true },
    });
    const { recordChange } = mount();
    const preview = screen.getByRole("button", { name: /Preview on Blue/ });
    expect(preview).toHaveAttribute("aria-pressed", "false");

    await fireEvent.click(preview);
    expect(get(mirrorPreviewStore)).toBe(true);
    const stop = screen.getByRole("button", { name: /Stop Previewing Blue/ });
    expect(stop).toHaveAttribute("aria-pressed", "true");
    // Previewing changes nothing in the project.
    expect(recordChange).not.toHaveBeenCalled();

    await fireEvent.click(stop);
    expect(get(mirrorPreviewStore)).toBe(false);
  });

  it("stops the preview when mirroring is turned off", async () => {
    extraDataStore.set({
      allianceMirroring: { drawnFor: "RED", mirror: true },
    });
    mirrorPreviewStore.set(true);
    mount();
    await fireEvent.click(mirrorBox());
    expect(get(mirrorPreviewStore)).toBe(false);
  });
});

it("holds only this project's options", () => {
  mount();
  expect(screen.queryByLabelText(/Pose Data/)).toBeNull();
  expect(screen.queryByLabelText(/Command Registrar/)).toBeNull();
  expect(screen.queryByLabelText(/Field Mirror/)).toBeNull();
});

it("folds away", async () => {
  mount();
  await fireEvent.click(
    screen.getByRole("button", {
      name: "Hide Alliance Selection & Path Mirroring",
    }),
  );
  expect(screen.queryByRole("radio", { name: "Red" })).toBeNull();
});

it("is marked as needing TurtleTracerLib", () => {
  mount();
  expect(
    screen.getByRole("link", { name: /Requires TurtleTracerLib/ }),
  ).toHaveAttribute(
    "href",
    "https://www.turtletracer.com/turtle-tracer-lib/auto-selector/",
  );
});
