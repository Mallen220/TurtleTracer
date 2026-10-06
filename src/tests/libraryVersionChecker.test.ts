// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const project = {
  readFile: vi.fn(
    async () => "implementation 'com.github.Mallen220:TurtleTracerLib:1.0.0'",
  ),
  fileExists: vi.fn(async (path: string) =>
    path.endsWith("build.dependencies.gradle"),
  ),
  openExternal: vi.fn(),
};

async function freshChecker() {
  vi.resetModules();
  return (await import("../utils/libraryVersionChecker")).checkLibraryVersion;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("checkLibraryVersion", () => {
  it("asks GitHub for the latest release once, however often the folder changes", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ tag_name: "v2.0.0" })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const check = await freshChecker();
    const notify = vi.fn();

    await check("/robot/TeamCode", project, notify);
    await check("/robot/TeamCode/src", project, notify);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls[0][0].message).toMatch(
      /v1\.0\.0\) is out of date/,
    );
  });

  it("tries again after a failed lookup", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValue(new Response(JSON.stringify({ tag_name: "2.0.0" })));
    vi.stubGlobal("fetch", fetchMock);
    const check = await freshChecker();
    const notify = vi.fn();

    await check("/robot/TeamCode", project, notify);
    expect(notify).not.toHaveBeenCalled();
    await check("/robot/TeamCode", project, notify);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
