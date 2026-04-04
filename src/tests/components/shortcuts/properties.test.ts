// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Don't import from svelte/store directly here for mocked variables
// Let vitest hoist this vi.mock completely independent of outside variables
vi.mock("../../../stores", async () => {
  const { writable } = await import("svelte/store");
  return {
    selectedLineId: writable(null),
    selectedPointId: writable(null),
    startPointStore: writable({
      heading: "tangential",
      reverse: false,
      locked: false,
    }),
    linesStore: writable([]),
    sequenceStore: writable([]),
  };
});

vi.mock("../../../lib/projectStore", async (importOriginal) => {
  const actual = await importOriginal<any>();
  const stores = await import("../../../stores");
  return {
    ...actual,
    startPointStore: (stores as any).startPointStore,
    linesStore: (stores as any).linesStore,
    sequenceStore: (stores as any).sequenceStore,
    selectedLineId: (stores as any).selectedLineId,
    selectedPointId: (stores as any).selectedPointId,
  };
});

vi.mock("../../../lib/actionRegistry", () => ({
  actionRegistry: {
    get: vi.fn((kind) => {
      if (kind === "wait") return { isWait: true };
      if (kind === "rotate") return { isRotate: true };
      return {};
    }),
  },
}));

vi.mock("../../../lib/components/shortcuts/utils", () => ({
  isUIElementFocused: vi.fn(() => false),
}));

vi.mock("../../../lib/utils/pathEditing", () => ({
  updateLinkedWaits: vi.fn((seq, id) => seq),
  updateLinkedRotations: vi.fn((seq, id) => seq),
}));

import { get } from "svelte/store";
import {
  modifyValue,
  toggleHeadingMode,
  toggleReverse,
  toggleLock,
} from "../../../lib/components/shortcuts/properties";

// The issue is trying to import these stores directly when they are not all actually exported
// from `stores` natively. We use dynamically mocked module.
import * as storesModule from "../../../stores";
import * as projectStoreModule from "../../../lib/projectStore";

const selectedPointId = (storesModule as any).selectedPointId;
const startPointStore = (projectStoreModule as any).startPointStore;
const linesStore = (projectStoreModule as any).linesStore;
const sequenceStore = (projectStoreModule as any).sequenceStore;

describe("properties shortcuts", () => {
  beforeEach(() => {
    (storesModule as any).selectedLineId.set(null);
    selectedPointId.set(null);
    startPointStore.set({
      heading: "tangential",
      reverse: false,
      locked: false,
    });
    linesStore.set([]);
    sequenceStore.set([]);
    vi.clearAllMocks();
  });

  it("should handle heading mode toggle for start point", () => {
    const recordChange = vi.fn();
    selectedPointId.set("point-0-0");

    toggleHeadingMode(recordChange);
    expect((get(startPointStore as any) as any).heading).toBe("constant");
    expect(recordChange).toHaveBeenCalledWith("Toggle Heading Mode");

    toggleHeadingMode(recordChange);
    expect((get(startPointStore as any) as any).heading).toBe("linear");

    toggleHeadingMode(recordChange);
    expect((get(startPointStore as any) as any).heading).toBe("tangential");
  });

  it("should handle heading mode toggle for line end point", () => {
    const recordChange = vi.fn();
    selectedPointId.set("point-1-0");
    linesStore.set([
      {
        id: "line-1",
        endPoint: { heading: "tangential", locked: false },
        locked: false,
      },
    ]);

    toggleHeadingMode(recordChange);
    expect((get(linesStore as any) as any)[0].endPoint.heading).toBe(
      "constant",
    );
    expect(recordChange).toHaveBeenCalledWith("Toggle Heading Mode");
  });

  it("should toggle reverse for start point", () => {
    const recordChange = vi.fn();
    selectedPointId.set("point-0-0");
    startPointStore.set({
      heading: "tangential",
      reverse: false,
      locked: false,
    });

    toggleReverse(recordChange);
    expect((get(startPointStore as any) as any).reverse).toBe(true);
    expect(recordChange).toHaveBeenCalledWith("Toggle Reverse");
  });

  it("should toggle lock for start point", () => {
    const recordChange = vi.fn();
    selectedPointId.set("point-0-0");

    toggleLock(recordChange);
    expect((get(startPointStore as any) as any).locked).toBe(true);
    expect(recordChange).toHaveBeenCalledWith("Toggle Lock");
  });

  it("should handle wait increment", () => {
    const recordChange = vi.fn();
    selectedPointId.set("wait-123");
    sequenceStore.set([
      { id: "123", kind: "wait", durationMs: 100, locked: false },
    ]);

    modifyValue(1, recordChange);

    const seq = get(sequenceStore as any) as any;
    expect(seq[0].durationMs).toBe(200); // 100 + 1 * 100
    expect(recordChange).toHaveBeenCalledWith("Modify Duration");
  });

  it("should handle rotate increment", () => {
    const recordChange = vi.fn();
    selectedPointId.set("rotate-456");
    sequenceStore.set([
      { id: "456", kind: "rotate", degrees: 90, locked: false },
    ]);

    modifyValue(1, recordChange);

    const seq = get(sequenceStore as any) as any;
    expect(seq[0].degrees).toBe(95); // 90 + 5
    expect(recordChange).toHaveBeenCalledWith("Modify Rotation");
  });

  it("should handle event marker increment", () => {
    const recordChange = vi.fn();
    selectedPointId.set("event-wait-123-0");
    sequenceStore.set([
      {
        id: "123",
        kind: "wait",
        locked: false,
        eventMarkers: [{ position: 0.5 }],
      },
    ]);

    modifyValue(1, recordChange);

    const seq = get(sequenceStore as any) as any;
    expect(seq[0].eventMarkers[0].position).toBe(0.51); // 0.5 + 0.01 * 1
    expect(recordChange).toHaveBeenCalledWith("Move Event Marker");
  });

  it("should handle rotate event marker increment", () => {
    const recordChange = vi.fn();
    selectedPointId.set("event-rotate-123-0");
    sequenceStore.set([
      {
        id: "123",
        kind: "rotate",
        locked: false,
        eventMarkers: [{ position: 0.5 }],
      },
    ]);

    modifyValue(1, recordChange);

    const seq = get(sequenceStore as any) as any;
    expect(seq[0].eventMarkers[0].position).toBe(0.51); // 0.5 + 0.01 * 1
    expect(recordChange).toHaveBeenCalledWith("Move Event Marker");
  });

  it("should handle line event marker increment", () => {
    const recordChange = vi.fn();
    selectedPointId.set("event-0-0");
    linesStore.set([
      { id: "line-0", locked: false, eventMarkers: [{ position: 0.5 }] },
    ]);

    modifyValue(1, recordChange);

    const lines = get(linesStore as any) as any;
    expect(lines[0].eventMarkers[0].position).toBe(0.51); // 0.5 + 0.01 * 1
    expect(recordChange).toHaveBeenCalledWith("Move Event Marker");
  });
});
