// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  isSupportedProjectFileName,
  isLegacyProjectFileName,
  stripProjectExtension,
  ensureDefaultProjectExtension,
  getProjectExtensionFromPath,
} from "../utils/fileExtensions";

describe("fileExtensions utilities", () => {
  describe("isSupportedProjectFileName", () => {
    it("should return true for .turt extension", () => {
      expect(isSupportedProjectFileName("project.turt")).toBe(true);
      expect(isSupportedProjectFileName("project.TURT")).toBe(true);
    });

    it("should return true for .pp extension", () => {
      expect(isSupportedProjectFileName("legacy.pp")).toBe(true);
      expect(isSupportedProjectFileName("legacy.PP")).toBe(true);
    });

    it("should return false for unsupported extensions", () => {
      expect(isSupportedProjectFileName("project.txt")).toBe(false);
      expect(isSupportedProjectFileName("project.json")).toBe(false);
      expect(isSupportedProjectFileName("project")).toBe(false);
      expect(isSupportedProjectFileName("")).toBe(false);
    });
  });

  describe("isLegacyProjectFileName", () => {
    it("should return true for .pp extension", () => {
      expect(isLegacyProjectFileName("legacy.pp")).toBe(true);
      expect(isLegacyProjectFileName("legacy.PP")).toBe(true);
      expect(isLegacyProjectFileName(".pp")).toBe(true);
    });

    it("should return false for other extensions", () => {
      expect(isLegacyProjectFileName("project.turt")).toBe(false);
      expect(isLegacyProjectFileName("legacy.txt")).toBe(false);
      expect(isLegacyProjectFileName("legacy")).toBe(false);
      expect(isLegacyProjectFileName("")).toBe(false);
    });
  });

  describe("stripProjectExtension", () => {
    it("should remove .turt extension", () => {
      expect(stripProjectExtension("project.turt")).toBe("project");
      expect(stripProjectExtension("project.TURT")).toBe("project");
    });

    it("should remove .pp extension", () => {
      expect(stripProjectExtension("legacy.pp")).toBe("legacy");
      expect(stripProjectExtension("legacy.PP")).toBe("legacy");
    });

    it("should not modify strings without project extensions", () => {
      expect(stripProjectExtension("project.txt")).toBe("project.txt");
      expect(stripProjectExtension("project")).toBe("project");
      expect(stripProjectExtension("")).toBe("");
    });

    it("should handle filenames with multiple dots", () => {
      expect(stripProjectExtension("project.v1.turt")).toBe("project.v1");
      expect(stripProjectExtension("project.backup.pp")).toBe("project.backup");
      expect(stripProjectExtension("project.turt.turt")).toBe("project.turt");
    });

    it("should not modify strings where the extension is not at the end", () => {
      expect(stripProjectExtension("project.turt.txt")).toBe(
        "project.turt.txt",
      );
      expect(stripProjectExtension("legacy.pp.bak")).toBe("legacy.pp.bak");
    });

    it("should not modify strings ending in extension characters without a dot", () => {
      expect(stripProjectExtension("projectturt")).toBe("projectturt");
      expect(stripProjectExtension("legacypp")).toBe("legacypp");
    });

    it("should handle just the extension", () => {
      expect(stripProjectExtension(".turt")).toBe("");
      expect(stripProjectExtension(".pp")).toBe("");
    });
  });

  describe("ensureDefaultProjectExtension", () => {
    it("should return the same path if it already has .turt extension", () => {
      expect(ensureDefaultProjectExtension("project.turt")).toBe(
        "project.turt",
      );
      expect(ensureDefaultProjectExtension("path/to/project.turt")).toBe(
        "path/to/project.turt",
      );
    });

    it("should preserve path when ending in case-insensitive .turt extension", () => {
      expect(ensureDefaultProjectExtension("project.TURT")).toBe(
        "project.TURT",
      );
      expect(ensureDefaultProjectExtension("project.Turt")).toBe(
        "project.Turt",
      );
    });

    it("should replace .pp with .turt", () => {
      expect(ensureDefaultProjectExtension("legacy.pp")).toBe("legacy.turt");
      expect(ensureDefaultProjectExtension("path/to/legacy.pp")).toBe(
        "path/to/legacy.turt",
      );
    });

    it("should replace case-insensitive .pp with .turt", () => {
      expect(ensureDefaultProjectExtension("legacy.PP")).toBe("legacy.turt");
      expect(ensureDefaultProjectExtension("path/to/legacy.Pp")).toBe(
        "path/to/legacy.turt",
      );
    });

    it("should append .turt if no project extension is present", () => {
      expect(ensureDefaultProjectExtension("project")).toBe("project.turt");
      expect(ensureDefaultProjectExtension("project.txt")).toBe(
        "project.txt.turt",
      );
      expect(ensureDefaultProjectExtension("path/to/project")).toBe(
        "path/to/project.turt",
      );
    });

    it("should handle empty string", () => {
      expect(ensureDefaultProjectExtension("")).toBe(".turt");
    });

    it("should handle paths with multiple dots", () => {
      expect(ensureDefaultProjectExtension("my.project.name")).toBe(
        "my.project.name.turt",
      );
      expect(ensureDefaultProjectExtension("my.project.name.pp")).toBe(
        "my.project.name.turt",
      );
    });
  });

  describe("getProjectExtensionFromPath", () => {
    it("should return .turt for missing or empty path", () => {
      expect(getProjectExtensionFromPath(null)).toBe(".turt");
      expect(getProjectExtensionFromPath(undefined)).toBe(".turt");
      expect(getProjectExtensionFromPath("")).toBe(".turt");
    });

    it("should return .pp for paths ending in .pp", () => {
      expect(getProjectExtensionFromPath("legacy.pp")).toBe(".pp");
      expect(getProjectExtensionFromPath("path/to/legacy.PP")).toBe(".pp");
    });

    it("should return .turt for paths ending in .turt", () => {
      expect(getProjectExtensionFromPath("project.turt")).toBe(".turt");
      expect(getProjectExtensionFromPath("path/to/project.TURT")).toBe(".turt");
    });

    it("should return .turt for paths with other or no extensions", () => {
      expect(getProjectExtensionFromPath("project.txt")).toBe(".turt");
      expect(getProjectExtensionFromPath("project")).toBe(".turt");
      expect(getProjectExtensionFromPath("project.csv")).toBe(".turt");
      expect(getProjectExtensionFromPath("project.data.json")).toBe(".turt");
    });

    it("should handle paths with leading and trailing spaces", () => {
      expect(getProjectExtensionFromPath("  project.turt  ")).toBe(".turt");
      expect(getProjectExtensionFromPath("  legacy.pp  ")).toBe(".pp");
      expect(getProjectExtensionFromPath("  project.txt  ")).toBe(".turt");
      expect(getProjectExtensionFromPath("  project  ")).toBe(".turt");
    });

    it("should handle paths that look like extensions but are not at the end", () => {
      expect(getProjectExtensionFromPath("project.turt.txt")).toBe(".turt");
      expect(getProjectExtensionFromPath("legacy.pp.bak")).toBe(".turt");
      expect(getProjectExtensionFromPath("project.turt_data")).toBe(".turt");
    });

    it("should handle unusual casing", () => {
      expect(getProjectExtensionFromPath("project.TuRt")).toBe(".turt");
      expect(getProjectExtensionFromPath("legacy.pP")).toBe(".pp");
    });
  });
});
