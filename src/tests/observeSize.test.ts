// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import { observeSize } from "../lib/actions/observeSize";

describe("observeSize", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubResizeObserver() {
    const instances: {
      callback: ResizeObserverCallback;
      observe: ReturnType<typeof vi.fn>;
      disconnect: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe = vi.fn();
        disconnect = vi.fn();
        constructor(public callback: ResizeObserverCallback) {
          instances.push(this);
        }
      },
    );
    return instances;
  }

  const resize = (
    observer: { callback: ResizeObserverCallback },
    width: number,
    height: number,
  ) =>
    observer.callback(
      [{ contentRect: { width, height } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );

  it("reports the element's size as it changes", () => {
    const instances = stubResizeObserver();
    const node = document.createElement("div");
    const onResize = vi.fn();
    observeSize(node, onResize);

    expect(instances[0].observe).toHaveBeenCalledWith(node);
    resize(instances[0], 300, 200);
    resize(instances[0], 320, 210);
    expect(onResize.mock.calls).toEqual([
      [{ width: 300, height: 200 }],
      [{ width: 320, height: 210 }],
    ]);
  });

  it("reports to the latest callback after an update", () => {
    const instances = stubResizeObserver();
    const first = vi.fn();
    const second = vi.fn();
    const action = observeSize(document.createElement("div"), first)!;
    action.update(second);
    resize(instances[0], 10, 20);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ width: 10, height: 20 });
  });

  it("stops watching when the element goes away", () => {
    const instances = stubResizeObserver();
    const action = observeSize(document.createElement("div"), vi.fn())!;
    action.destroy();
    expect(instances[0].disconnect).toHaveBeenCalled();
  });

  it("does nothing where ResizeObserver doesn't exist", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    expect(observeSize(document.createElement("div"), vi.fn())).toBeUndefined();
  });
});
