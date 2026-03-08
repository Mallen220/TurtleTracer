// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
declare module "gif.js" {
  interface GIFOptions {
    workers?: number;
    quality?: number;
    width?: number;
    height?: number;
    workerScript?: string;
  }
  class GIF {
    constructor(options?: GIFOptions);
    addFrame(element: any, opts?: { copy?: boolean; delay?: number }): void;
    on(event: string, cb: (arg?: any) => void): void;
    render(): void;
  }
  export default GIF;
}
