// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  COMMAND_LIBRARIES,
  DEFAULT_COMMAND_LIBRARY,
  getCommandLibrary,
  libraryForContext,
} from "../lib/exporters/commandLibraries";

describe("command library registry", () => {
  it("lists each library once, with the default first", () => {
    const ids = COMMAND_LIBRARIES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(DEFAULT_COMMAND_LIBRARY);
  });

  it("looks libraries up by id and falls back to the default", () => {
    expect(getCommandLibrary("Ivy").id).toBe("Ivy");
    expect(getCommandLibrary("Removed").id).toBe(DEFAULT_COMMAND_LIBRARY);
    expect(getCommandLibrary(undefined).id).toBe(DEFAULT_COMMAND_LIBRARY);
    expect(getCommandLibrary(null).id).toBe(DEFAULT_COMMAND_LIBRARY);
  });

  it("picks the library for an action context, honouring legacy isNextFTC", () => {
    expect(libraryForContext({ targetLibrary: "Ivy" }).id).toBe("Ivy");
    expect(libraryForContext({ isNextFTC: true }).id).toBe("NextFTC");
    expect(libraryForContext({}).id).toBe("SolversLib");
    // targetLibrary wins when both are present.
    expect(
      libraryForContext({ targetLibrary: "Ivy", isNextFTC: true }).id,
    ).toBe("Ivy");
  });
});
