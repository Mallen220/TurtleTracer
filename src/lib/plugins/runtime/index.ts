// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The first script in a plugin's hidden frame
// (turtle-plugin://<id>/__turtle/main.html). Built on its own into
// dist/plugin-runtime.js. It waits for the app to connect, sets up the
// global `turtle`, then loads the plugin's bundled main script.
import { Rpc, type Message } from "../protocol/rpc";
import { CONNECT, HELLO, type RuntimeInit } from "../protocol/runtime";
import { createRuntime, type Runtime } from "./createTurtle";

function describe(error: unknown) {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function start(port: MessagePort, init: RuntimeInit) {
  let runtime: Runtime | undefined;
  const rpc = new Rpc((message) => port.postMessage(message), {
    call: (method, args) => runtime?.handleCall(method, args),
    notify: (method, args) => runtime?.handleNotify(method, args),
  });
  runtime = createRuntime(rpc, init);
  port.onmessage = (event) => void rpc.receive(event.data as Message);

  Object.defineProperty(globalThis, "turtle", {
    value: runtime.turtle,
    enumerable: true,
  });

  const report = (error: unknown) => rpc.notify("error", [describe(error)]);
  addEventListener("error", (event) => report(event.error ?? event.message));
  addEventListener("unhandledrejection", (event) => report(event.reason));

  const script = document.createElement("script");
  script.src = "/__turtle/main.js";
  script.onload = () => rpc.notify("ready");
  script.onerror = () => report("The plugin's main script couldn't be loaded.");
  document.head.append(script);
}

addEventListener("message", function onConnect(event: MessageEvent) {
  if (event.source !== parent || event.data?.type !== CONNECT) return;
  if (!event.ports[0]) return;
  removeEventListener("message", onConnect);
  start(event.ports[0], event.data.init as RuntimeInit);
});
parent.postMessage({ type: HELLO }, "*");
