// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanEventsInDirectory } from "../../utils/eventScanner";
import { diskEventNamesStore } from "../../stores";

describe("scanEventsInDirectory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    diskEventNamesStore.set([]);
    (window as any).electronAPI = {
      listFiles: vi.fn(),
      readFile: vi.fn(),
    };
  });

  it("should do nothing if electronAPI is missing", async () => {
    (window as any).electronAPI = null;
    await scanEventsInDirectory("/test");
    let storeVal;
    diskEventNamesStore.subscribe((v) => (storeVal = v))();
    expect(storeVal).toEqual([]);
  });

  it("should scan directory and extract event names from valid files", async () => {
    (window as any).electronAPI.listFiles.mockResolvedValue([
      { name: "test.turt", path: "/test/test.turt" },
      { name: "other.txt", path: "/test/other.txt" },
    ]);

    const mockData = {
      lines: [
        {
          eventMarkers: [
            { name: "Event1" },
            { name: "  Event2  " },
            { name: "" },
          ],
        },
      ],
      sequence: [
        { kind: "wait", eventMarkers: [{ name: "SeqEvent" }] },
        { kind: "rotate", eventMarkers: [{ name: "Event1" }] }, // duplicate
      ],
    };

    (window as any).electronAPI.readFile.mockResolvedValue(
      JSON.stringify(mockData),
    );

    await scanEventsInDirectory("/test");

    let storeVal: string[] = [];
    diskEventNamesStore.subscribe((v) => (storeVal = v))();

    expect(storeVal.sort()).toEqual(["Event1", "Event2", "SeqEvent"]);
  });

  it("should handle parsing errors gracefully", async () => {
    (window as any).electronAPI.listFiles.mockResolvedValue([
      { name: "test.turt", path: "/test/test.turt" },
    ]);
    (window as any).electronAPI.readFile.mockRejectedValue(
      new Error("Parse fail"),
    );

    await scanEventsInDirectory("/test");

    let storeVal: string[] = [];
    diskEventNamesStore.subscribe((v) => (storeVal = v))();
    expect(storeVal).toEqual([]);
  });
});
