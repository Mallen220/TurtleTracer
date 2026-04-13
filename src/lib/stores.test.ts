import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import {
  diffMode,
  committedData,
  diffResult,
  isLoadingDiff,
  toggleDiff,
} from "./diffStore";
import {
  telemetryState,
  robotPose,
  telemetryLines,
  isConnected,
  fieldOverlay,
  processTelemetryMessage,
  setStatus,
  liveTelemetryData,
} from "./telemetryStore";
import { currentFilePath } from "../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "./projectStore";

describe("diffStore", () => {
  let gitShowMock: any;

  beforeEach(() => {
    gitShowMock = vi.fn();
    vi.stubGlobal("electronAPI", {
      gitShow: gitShowMock,
    });

    // Reset stores
    diffMode.set(false);
    committedData.set(null);
    diffResult.set(null);
    isLoadingDiff.set(false);
    currentFilePath.set("test-path.json");

    // Default current project data
    startPointStore.set({ x: 0, y: 0, heading: "tangential", reverse: false });
    linesStore.set([]);
    sequenceStore.set([]);
    shapesStore.set([]);
    settingsStore.set({
      robotWidth: 18,
      robotLength: 18,
      maxVelocity: 50,
      maxAcceleration: 50,
      theme: "dark",
      autoSave: false,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("should have correct initial state", () => {
    expect(get(diffMode)).toBe(false);
    expect(get(committedData)).toBeNull();
    expect(get(diffResult)).toBeNull();
    expect(get(isLoadingDiff)).toBe(false);
  });

  it("should warn and do nothing if no file path", async () => {
    currentFilePath.set(null);
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    await toggleDiff();
    expect(consoleWarnSpy).toHaveBeenCalledWith("No file path to diff against");
    expect(get(diffMode)).toBe(false);
  });

  it("should fetch, parse and compute diff successfully", async () => {
    const mockOldData = {
      startPoint: { x: 1, y: 1, heading: "tangential", reverse: false },
      lines: [],
      sequence: [],
      shapes: [],
      settings: {},
    };
    gitShowMock.mockResolvedValue(JSON.stringify(mockOldData));

    await toggleDiff();

    expect(get(isLoadingDiff)).toBe(false);
    expect(get(diffMode)).toBe(true);
    expect(get(committedData)).toMatchObject({ startPoint: { x: 1, y: 1 } });
    expect(get(diffResult)).not.toBeNull();
  });

  it("should toggle diff mode off and clear data", async () => {
    diffMode.set(true);
    committedData.set({} as any);
    diffResult.set({} as any);

    await toggleDiff();

    expect(get(diffMode)).toBe(false);
    expect(get(committedData)).toBeNull();
    expect(get(diffResult)).toBeNull();
  });
});

describe("telemetryStore", () => {
  beforeEach(() => {
    telemetryState.set({ status: "DISCONNECTED", packet: null, fps: 0 });
    liveTelemetryData.set(null);
  });

  it("should have initial state", () => {
    const state = get(telemetryState);
    expect(state.status).toBe("DISCONNECTED");
    expect(state.packet).toBeNull();
    expect(state.fps).toBe(0);
  });

  it("should update status", () => {
    setStatus("CONNECTED");
    expect(get(telemetryState).status).toBe("CONNECTED");
    expect(get(isConnected)).toBe(true);
  });

  it("should process standard telemetry packet correctly", () => {
    const packet = {
      timestamp: 1000,
      robotPose: { x: 10, y: 20, heading: Math.PI },
      data: { some: "line" },
    };

    processTelemetryMessage(JSON.stringify(packet));

    const state = get(telemetryState);
    expect(state.packet).toMatchObject({ timestamp: 1000 });

    // Check derived stores
    expect(get(robotPose)).toEqual({ x: 10, y: 20, heading: Math.PI });
    expect(get(telemetryLines)).toEqual({ some: "line" });

    // Check live telemetry history
    const history = get(liveTelemetryData);
    expect(history).not.toBeNull();
    expect(history![0]).toMatchObject({ x: 10, y: 20, heading: 180 }); // Math.PI rads = 180 deg
  });

  it("should process TurtleTracerLiveView flat format correctly", () => {
    const flatData = {
      x: 5,
      y: 15,
      heading: Math.PI / 2,
    };

    processTelemetryMessage(JSON.stringify(flatData));

    const state = get(telemetryState);
    expect(state.packet?.robotPose).toEqual(flatData);
    expect(typeof state.packet?.timestamp).toBe("number"); // Auto-generated
  });

  it("should ignore invalid JSON silently without crashing", () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    processTelemetryMessage("invalid-json");
    expect(consoleWarnSpy).toHaveBeenCalled();
    const state = get(telemetryState);
    expect(state.packet).toBeNull();
  });

  it("should correctly handle fieldOverlay derived store", () => {
    const packetWithOverlay = {
      timestamp: 123,
      fieldOverlay: [{ type: "point", x: 1, y: 1 }],
    };
    processTelemetryMessage(JSON.stringify(packetWithOverlay));

    expect(get(fieldOverlay)).toEqual([{ type: "point", x: 1, y: 1 }]);

    // Test coercion to array
    const packetWithSingleOverlay = {
      timestamp: 124,
      fieldOverlay: { type: "line", x: 2, y: 2 },
    };
    processTelemetryMessage(JSON.stringify(packetWithSingleOverlay));
    expect(get(fieldOverlay)).toEqual([{ type: "line", x: 2, y: 2 }]);
  });
});
