// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanEventsInDirectory, scanForEvents } from "../../utils/eventScanner";
import { diskEventNamesStore } from "../../stores";
import type { EventMarker, Point } from "../../types";

describe("scanForEvents", () => {
  it("should return empty array if path or markers are empty", () => {
    const path: Point[] = [{ x: 0, y: 0, heading: "tangential" }];
    const markers: EventMarker[] = [];
    expect(scanForEvents(path, markers)).toEqual([]);
    expect(scanForEvents([], [{ id: "1", name: "m", position: 0 }])).toEqual(
      [],
    );
  });

  it("should match marker at position 0 to the first point", () => {
    const path: Point[] = [
      { x: 0, y: 0, heading: "tangential" },
      { x: 10, y: 0, heading: "tangential" },
    ];
    const markers: EventMarker[] = [
      { id: "1", name: "startMarker", position: 0 },
    ];

    const matches = scanForEvents(path, markers);
    expect(matches).toHaveLength(1);
    expect(matches[0].marker.name).toBe("startMarker");
    expect(matches[0].point).toEqual(path[0]);
    expect(matches[0].distance).toBe(0);
  });

  it("should match marker at position 1 to the last point", () => {
    const path: Point[] = [
      { x: 0, y: 0, heading: "tangential" },
      { x: 10, y: 0, heading: "tangential" },
      { x: 20, y: 0, heading: "tangential" },
    ];
    const markers: EventMarker[] = [
      { id: "1", name: "endMarker", position: 1 },
    ];

    const matches = scanForEvents(path, markers);
    expect(matches).toHaveLength(1);
    expect(matches[0].marker.name).toBe("endMarker");
    expect(matches[0].point).toEqual(path[2]);
    expect(matches[0].distance).toBe(20);
  });

  it("should match marker at position 0.5 to the middle point", () => {
    const path: Point[] = [
      { x: 0, y: 0, heading: "tangential" },
      { x: 10, y: 0, heading: "tangential" },
      { x: 20, y: 0, heading: "tangential" },
    ];
    const markers: EventMarker[] = [
      { id: "1", name: "midMarker", position: 0.5 },
    ];

    const matches = scanForEvents(path, markers);
    expect(matches).toHaveLength(1);
    expect(matches[0].marker.name).toBe("midMarker");
    expect(matches[0].point).toEqual(path[1]);
    expect(matches[0].distance).toBe(10);
  });

  it("should handle multiple markers at different positions", () => {
    const path: Point[] = [
      { x: 0, y: 0, heading: "tangential" },
      { x: 0, y: 5, heading: "tangential" },
      { x: 0, y: 10, heading: "tangential" },
      { x: 0, y: 15, heading: "tangential" },
      { x: 0, y: 20, heading: "tangential" },
    ];
    const markers: EventMarker[] = [
      { id: "1", name: "m1", position: 0.25 }, // should map to distance 5, index 1
      { id: "2", name: "m2", position: 0.75 }, // should map to distance 15, index 3
      { id: "3", name: "m3", position: 1.5 }, // should map to distance 20 (clamped to 1.0), index 4
      { id: "4", name: "m4", position: -0.5 }, // should map to distance 0 (clamped to 0), index 0
    ];

    const matches = scanForEvents(path, markers);
    expect(matches).toHaveLength(4);

    expect(matches[0].point).toEqual(path[1]);
    expect(matches[0].distance).toBe(5);

    expect(matches[1].point).toEqual(path[3]);
    expect(matches[1].distance).toBe(15);

    expect(matches[2].point).toEqual(path[4]);
    expect(matches[2].distance).toBe(20);

    expect(matches[3].point).toEqual(path[0]);
    expect(matches[3].distance).toBe(0);
  });
});

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

    expect(
      [...storeVal].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
      ),
    ).toEqual(["Event1", "Event2", "SeqEvent"]);
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
