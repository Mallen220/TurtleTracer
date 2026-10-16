// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The `turtle:view` module a plugin's view imports (api/view.ts). Built on
// its own into dist/plugin-view-client.js and bundled into the view's
// scripts by the main process. It runs in the view's sandboxed frame and
// talks to the app over the MessagePort the app hands it.
import type { JsonValue, TurtleView, ViewScene } from "../api";
import { CONNECT, HELLO } from "../protocol/runtime";

interface Connection {
  port: MessagePort;
  name: string;
}

let connection: Promise<Connection> | undefined;

/** Waits for the app to hand over a port. */
function handshake(): Promise<Connection> {
  connection ??= new Promise((resolve) => {
    addEventListener("message", function onConnect(event: MessageEvent) {
      const data = event.data;
      if (event.source !== parent || data?.type !== CONNECT) return;
      if (!event.ports[0]) return;
      removeEventListener("message", onConnect);
      resolve({ port: event.ports[0], name: data.name });
    });
    parent.postMessage({ type: HELLO }, "*");
  });
  return connection;
}

// Say hello as soon as the view starts, before it calls connect().
void handshake();

type Listeners = {
  scene: ((payload: any) => void)[];
  frame: ((payload: any) => void)[];
  message: ((payload: any) => void)[];
};

let view: Promise<TurtleView> | undefined;

/** Connects to Turtle Tracer. Calling it again gives the same connection. */
export function connect(): Promise<TurtleView> {
  view ??= open();
  return view;
}

async function open(): Promise<TurtleView> {
  const { port, name } = await handshake();
  let scene: ViewScene | undefined;
  let gotScene: (() => void) | undefined;
  const firstScene = new Promise<void>((resolve) => (gotScene = resolve));
  const listeners: Listeners = { scene: [], frame: [], message: [] };

  const send = (type: string, payload?: unknown) =>
    port.postMessage({ type, payload });
  const report = (error: unknown) =>
    send(
      "error",
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );

  port.onmessage = (event) => {
    const { type, payload } = event.data ?? {};
    if (type === "ping") {
      send("pong");
      return;
    }
    if (type === "scene") {
      scene = payload;
      gotScene?.();
    }
    for (const listener of listeners[type as keyof Listeners] ?? []) {
      try {
        listener(payload);
      } catch (error) {
        report(error);
      }
    }
  };
  addEventListener("error", (event) => report(event.error ?? event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));

  // The app sends the scene straight after connecting.
  await firstScene;
  return Object.freeze({
    name,
    get scene() {
      return scene!;
    },
    onScene: (listener) => void listeners.scene.push(listener),
    onFrame: (listener) => void listeners.frame.push(listener),
    onMessage: (listener) => void listeners.message.push(listener),
    post: (message: JsonValue) => send("post", message),
    seek: (time) => send("seek", time),
    play: () => send("play"),
    pause: () => send("pause"),
  } satisfies TurtleView);
}
