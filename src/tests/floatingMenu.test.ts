// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, afterEach, vi } from "vitest";
import { tick } from "svelte";
import { floatingMenu, keepOnScreen } from "../lib/actions/floatingMenu";

const menuOfSize = (width: number, height: number) =>
  ({ getBoundingClientRect: () => ({ width, height }) }) as HTMLElement;

describe("keepOnScreen", () => {
  afterEach(() => vi.unstubAllGlobals());

  const windowOfSize = (width: number, height: number) => {
    vi.stubGlobal("innerWidth", width);
    vi.stubGlobal("innerHeight", height);
  };

  it("opens where it was asked to when it fits", () => {
    windowOfSize(1000, 800);
    expect(keepOnScreen(100, 200, menuOfSize(180, 300))).toEqual({
      x: 100,
      y: 200,
    });
  });

  it("opens to the left when it would run off the right edge", () => {
    windowOfSize(1000, 800);
    expect(keepOnScreen(900, 200, menuOfSize(180, 300))).toEqual({
      x: 720,
      y: 200,
    });
  });

  it("opens upwards when it would run off the bottom", () => {
    windowOfSize(1000, 800);
    expect(keepOnScreen(100, 700, menuOfSize(180, 300))).toEqual({
      x: 100,
      y: 400,
    });
  });

  it("can use the whole width, touching the edge exactly", () => {
    windowOfSize(1000, 800);
    expect(keepOnScreen(820, 500, menuOfSize(180, 300))).toEqual({
      x: 820,
      y: 500,
    });
  });
});

describe("floatingMenu action", () => {
  const menu = (width = 180, height = 300) => {
    const node = document.createElement("div");
    node.getBoundingClientRect = () => ({ width, height }) as DOMRect;
    document.body.append(node);
    return node;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("puts the menu at the click straight away, then keeps it on screen", async () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const node = menu();
    floatingMenu(node, { x: 900, y: 100, onclose: vi.fn() });
    expect([node.style.left, node.style.top]).toEqual(["900px", "100px"]);

    await tick();
    expect([node.style.left, node.style.top]).toEqual(["720px", "100px"]);
  });

  it("moves when the menu is reopened somewhere else", async () => {
    vi.stubGlobal("innerWidth", 1000);
    vi.stubGlobal("innerHeight", 800);
    const node = menu();
    const action = floatingMenu(node, { x: 10, y: 10, onclose: vi.fn() });
    await tick();
    action.update({ x: 50, y: 60, onclose: vi.fn() });
    await tick();
    expect([node.style.left, node.style.top]).toEqual(["50px", "60px"]);
  });

  it("closes on a mouse press outside the menu but not inside it", () => {
    const onclose = vi.fn();
    const node = menu();
    const inside = document.createElement("button");
    node.append(inside);
    const action = floatingMenu(node, { x: 0, y: 0, onclose });

    inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onclose).not.toHaveBeenCalled();

    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onclose).toHaveBeenCalledTimes(1);

    action.destroy();
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it("calls the latest onclose after an update", () => {
    const first = vi.fn();
    const second = vi.fn();
    const node = menu();
    const action = floatingMenu(node, { x: 0, y: 0, onclose: first });
    action.update({ x: 0, y: 0, onclose: second });
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
