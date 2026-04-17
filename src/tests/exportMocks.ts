// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export function setupImageMocks() {
  class MockImage {
    _src = "";
    width = 100;
    height = 100;
    crossOrigin = "";
    onload: () => void = () => {};
    onerror: (err: any) => void = () => {};

    get src() {
      return this._src;
    }

    set src(val: string) {
      this._src = val;
      // Keep asynchronous semantics with a small delay so abort tests remain meaningful
      // while still keeping high-frame tests within timeout budgets.
      setTimeout(() => {
        if (val === "error") {
          if (this.onerror) this.onerror(new Error("Failed to load"));
        } else if (this.onload) this.onload();
      }, 2);
    }
  }
  globalThis.Image = MockImage as any;

  globalThis.XMLSerializer = class {
    serializeToString(node: Node) {
      return "<svg></svg>";
    }
  } as any;
}
