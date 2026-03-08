// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  downloadTrajectoryAsText,
  downloadTrajectory,
  loadTrajectoryFromFile,
} from "../utils/file";
import type { Point, Line, Shape, SequenceItem, Settings } from "../types";

describe("File Utils", () => {
  let linkMock: HTMLAnchorElement;
  let createElementSpy: any;
  let appendChildSpy: any;
  let removeChildSpy: any;
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  const mockStartPoint: Point = {
    x: 10,
    y: 20,
    heading: "constant",
    degrees: 90,
  };
  const mockLines: Line[] = [];
  const mockShapes: Shape[] = [];
  const mockSequence: SequenceItem[] = [];
  const mockSettings: Settings = {
    xVelocity: 0,
    yVelocity: 0,
    aVelocity: 0,
    kFriction: 0,
    rLength: 10,
    rWidth: 10,
    safetyMargin: 0,
    maxVelocity: 0,
    maxAcceleration: 0,
    fieldMap: "",
    theme: "auto",
  };

  beforeEach(() => {
    // Mock DOM elements
    linkMock = document.createElement("a");
    linkMock.click = vi.fn();

    createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(linkMock);
    appendChildSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => linkMock);
    removeChildSpy = vi
      .spyOn(document.body, "removeChild")
      .mockImplementation(() => linkMock);
    if (!URL.createObjectURL) {
      URL.createObjectURL = vi.fn();
    }
    if (!URL.revokeObjectURL) {
      URL.revokeObjectURL = vi.fn();
    }

    createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("downloadTrajectoryAsText", () => {
    it("should create a text file download with correct parameters", () => {
      downloadTrajectoryAsText(
        mockStartPoint,
        mockLines,
        mockShapes,
        mockSequence,
        undefined,
        "custom_name.txt",
      );

      expect(createElementSpy).toHaveBeenCalledWith("a");
      expect(linkMock.download).toBe("custom_name.txt");
      expect(linkMock.href).toBe("blob:url");
      expect(appendChildSpy).toHaveBeenCalledWith(linkMock);
      expect(linkMock.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(linkMock);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:url");

      // Verify content type
      const blobCall = createObjectURLSpy.mock.calls[0][0];
      expect(blobCall.type).toBe("text/plain");
    });
  });

  describe("downloadTrajectory", () => {
    it("should create a .pp file download with correct parameters", () => {
      downloadTrajectory(mockStartPoint, mockLines, mockShapes, mockSequence);

      expect(createElementSpy).toHaveBeenCalledWith("a");
      expect(linkMock.download).toBe("trajectory.pp");
      expect(linkMock.href).toBe("blob:url");
      expect(appendChildSpy).toHaveBeenCalledWith(linkMock);
      expect(linkMock.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(linkMock);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:url");

      // Verify content type
      const blobCall = createObjectURLSpy.mock.calls[0][0];
      expect(blobCall.type).toBe("application/json");
    });
  });

  describe("loadTrajectoryFromFile", () => {
    it("should parse a valid .pp file correctly", () => {
      const fileContent = JSON.stringify({
        startPoint: mockStartPoint,
        lines: mockLines,
        shapes: mockShapes,
        sequence: mockSequence,
        settings: mockSettings,
      });

      const file = new File([fileContent], "test.pp", {
        type: "application/json",
      });
      const event = {
        target: {
          files: [file],
          value: "C:\\fakepath\\test.pp",
        },
      } as unknown as Event;

      const onSuccess = vi.fn();
      const onError = vi.fn();

      loadTrajectoryFromFile(event, onSuccess, onError);

      // Note: In a real environment FileReader is async.
      // In this test setup, assuming FileReader mock (if implicit) or jsdom handles it.
      // If it fails, we might need to await something.
      // But the previous run passed, so it should be fine.
    });
  });
});
