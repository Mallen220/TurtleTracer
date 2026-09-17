// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type {
  SequenceMacroItem,
  SequencePathItem,
  SequenceItem,
  SequenceWaitItem,
  SequenceRotateItem,
} from "../types";
import { actionRegistry } from "../lib/actionRegistry";

export const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";

export const waitKind = (): SequenceWaitItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isWait)
    ?.kind as SequenceWaitItem["kind"]) ?? "wait";

export const rotateKind = (): SequenceRotateItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isRotate)
    ?.kind as SequenceRotateItem["kind"]) ?? "rotate";

export const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

export const isPathItem = (s: SequenceItem): s is SequencePathItem =>
  s.kind === pathKind();

export const isMacroItem = (s: SequenceItem): s is SequenceMacroItem =>
  s.kind === macroKind();

export const setupUIViewport = () => {
  Object.defineProperty(globalThis, "innerWidth", {
    writable: true,
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(globalThis, "innerHeight", {
    writable: true,
    configurable: true,
    value: 1000,
  });
};

export const testMenuOffScreenPositioning = async (
  initialProps: any,
  updatedProps: any,
  tick: any,
  screen: any,
  expect: any,
  renderComponent: any,
) => {
  const { rerender } = renderComponent(initialProps);
  const menuNodes = screen.getAllByRole("menu");
  const menuNode = menuNodes.at(-1); // get the latest rendered menu
  menuNode.getBoundingClientRect = () =>
    ({
      width: 200,
      height: 200,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    }) as any;
  await tick();
  await tick();
  expect(menuNode.style.left).toBe("700px");
  expect(menuNode.style.top).toBe("700px");
  await rerender(updatedProps);
  await tick();
  await tick();
  expect(menuNode.style.left).toBe("100px");
  expect(menuNode.style.top).toBe("100px");
};
