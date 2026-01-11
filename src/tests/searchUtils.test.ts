// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSnippet,
  highlightSnippet,
  highlightText,
} from "../lib/components/whats-new/searchUtils";
import { JSDOM } from "jsdom";

describe("WhatsNew Search Utils", () => {
  describe("getSnippet", () => {
    it("should return null if query not found", () => {
      expect(getSnippet("hello world", "xyz")).toBeNull();
    });

    it("should return the line containing the match", () => {
      const text = "line 1\nline 2 match\nline 3";
      expect(getSnippet(text, "match")).toBe("line 2 match");
    });

    it("should handle match at the beginning", () => {
      const text = "match line\nline 2";
      expect(getSnippet(text, "match")).toBe("match line");
    });

    it("should handle match at the end", () => {
      const text = "line 1\nline 2 match";
      expect(getSnippet(text, "match")).toBe("line 2 match");
    });

    it("should be case insensitive", () => {
      const text = "Line Match";
      expect(getSnippet(text, "match")).toBe("Line Match");
    });
  });

  describe("highlightSnippet", () => {
    it("should return escaped text if query is empty", () => {
      expect(highlightSnippet("hello", "")).toBe("hello");
      expect(highlightSnippet("<div>", "")).toBe("&lt;div&gt;");
    });

    it("should escape HTML characters", () => {
      // Here we test that if we search for 'div', it highlights 'div' correctly
      // and escapes the < >.
      // Input: <div>
      // Query: div
      // Expected: &lt;<span ...>div</span>&gt;
      expect(highlightSnippet("<div>", "div")).toContain("&lt;<span");
      expect(highlightSnippet("<div>", "div")).toContain("div</span>&gt;");
    });

    it("should wrap match in span", () => {
      const result = highlightSnippet("hello world", "world");
      expect(result).toContain(
        'hello <span class="bg-yellow-200 dark:bg-yellow-800 text-neutral-900 dark:text-neutral-100 rounded-sm px-0.5">world</span>',
      );
    });

    it("should handle case insensitive match", () => {
      const result = highlightSnippet("Hello World", "world");
      expect(result).toContain(
        'Hello <span class="bg-yellow-200 dark:bg-yellow-800 text-neutral-900 dark:text-neutral-100 rounded-sm px-0.5">World</span>',
      );
    });

    it("should not highlight inside escaped entities incorrectly", () => {
      // Input: 5 < 10
      // Query: lt
      // Text: 5 &lt; 10
      // "lt" is in "&lt;"
      // But since we search in original text "5 < 10", "lt" is NOT found.
      // So result should be "5 &lt; 10" without highlighting.
      expect(highlightSnippet("5 < 10", "lt")).toBe("5 &lt; 10");
    });

    it("should highlight match even if it looks like an entity part", () => {
      // Input: result
      // Query: lt
      // Text: resu&lt; (if we manually escaped)
      // Original: result
      // Match found at index 4 ("lt")
      // Result: resu<span>lt</span>
      expect(highlightSnippet("result", "lt")).toContain("resu<span");
      expect(highlightSnippet("result", "lt")).toContain("lt</span>");
    });
  });

  describe("highlightText (DOM)", () => {
    let dom: JSDOM;
    let document: Document;

    beforeEach(() => {
      dom = new JSDOM(
        '<!DOCTYPE html><div id="root">Hello World. This is a test.</div>',
      );
      document = dom.window.document;
      // Polyfill TreeWalker for JSDOM if needed (JSDOM supports it)
      global.document = document;
      global.NodeFilter = dom.window.NodeFilter;
      global.Node = dom.window.Node;
    });

    afterEach(() => {
      // Clean up globals set for JSDOM. Cast to `any` so `delete` is allowed by TypeScript.
      delete (global as any).document;
      delete (global as any).NodeFilter;
      delete (global as any).Node;
    });

    it("should highlight text in DOM", () => {
      const root = document.getElementById("root")!;
      highlightText(root, "test");

      expect(root.innerHTML).toContain(
        '<mark class="bg-yellow-200 dark:bg-yellow-800 text-neutral-900 dark:text-neutral-100 rounded-sm px-0.5">test</mark>',
      );
    });

    it("should not highlight inside existing marks", () => {
      const root = document.getElementById("root")!;
      root.innerHTML = "<mark>test</mark>";
      highlightText(root, "test");
      // Should remain as is (or at least not nested mark)
      // The function skips nodes whose parent is MARK
      const marks = root.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0].innerHTML).toBe("test");
    });

    it("should handle multiple matches", () => {
      const root = document.getElementById("root")!;
      root.innerHTML = "test one test two";
      highlightText(root, "test");
      const marks = root.querySelectorAll("mark");
      expect(marks.length).toBe(2);
    });

    it("should update highlights when query changes and clear on empty query", () => {
      const root = document.getElementById("root")!;
      root.innerHTML = "Path editing";

      // Initial short query
      highlightText(root, "p");
      let marks = root.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe("P");

      // Longer query should re-highlight the full match
      highlightText(root, "pa");
      marks = root.querySelectorAll("mark");
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe("Pa");

      // Clearing the query should remove marks
      highlightText(root, "");
      expect(root.querySelectorAll("mark").length).toBe(0);
    });
  });
});
