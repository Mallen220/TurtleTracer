import { describe, it, expect } from "vitest";
import { getButtonFilledClass } from "../utils/buttonStyles";

describe("buttonStyles", () => {
  describe("getButtonFilledClass", () => {
    it("returns correct class string for 'green'", () => {
      expect(getButtonFilledClass("green")).toBe(
        "bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 focus:ring-green-300 dark:focus:ring-green-700",
      );
    });

    it("returns correct class string for 'purple'", () => {
      expect(getButtonFilledClass("purple")).toBe(
        "bg-purple-600 dark:bg-purple-700 hover:bg-purple-700 dark:hover:bg-purple-600 focus:ring-purple-300 dark:focus:ring-purple-700",
      );
    });

    it("returns correct class string for 'pink'", () => {
      expect(getButtonFilledClass("pink")).toBe(
        "bg-pink-600 dark:bg-pink-700 hover:bg-pink-700 dark:hover:bg-pink-600 focus:ring-pink-300 dark:focus:ring-pink-700",
      );
    });

    it("returns correct class string for 'amber'", () => {
      expect(getButtonFilledClass("amber")).toBe(
        "bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-500 focus:ring-amber-300 dark:focus:ring-amber-600",
      );
    });

    it("returns correct class string for 'indigo'", () => {
      expect(getButtonFilledClass("indigo")).toBe(
        "bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-600 focus:ring-indigo-300 dark:focus:ring-indigo-700",
      );
    });

    it("returns correct class string for 'blue'", () => {
      expect(getButtonFilledClass("blue")).toBe(
        "bg-blue-600 dark:bg-blue-700 hover:bg-blue-700 dark:hover:bg-blue-600 focus:ring-blue-300 dark:focus:ring-blue-700",
      );
    });

    it("returns correct class string for 'red'", () => {
      expect(getButtonFilledClass("red")).toBe(
        "bg-red-600 dark:bg-red-700 hover:bg-red-700 dark:hover:bg-red-600 focus:ring-red-300 dark:focus:ring-red-700",
      );
    });

    it("returns correct class string for 'gray'", () => {
      expect(getButtonFilledClass("gray")).toBe(
        "bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 focus:ring-gray-200 dark:focus:ring-gray-500",
      );
    });

    it("returns gray class string for an unknown color", () => {
      const grayClass =
        "bg-gray-500 dark:bg-gray-600 hover:bg-gray-600 dark:hover:bg-gray-500 focus:ring-gray-200 dark:focus:ring-gray-500";
      expect(getButtonFilledClass("unknown-color")).toBe(grayClass);
      expect(getButtonFilledClass("")).toBe(grayClass);
      expect(getButtonFilledClass("yellow")).toBe(grayClass);
    });
  });
});
