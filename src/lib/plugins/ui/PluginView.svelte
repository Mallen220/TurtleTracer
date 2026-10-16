<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  One of a plugin's views, in a sandboxed frame on the plugin's own origin.
  The frame gets the scene and the robot's pose over a MessagePort; if it
  stops answering it's replaced with a message and a Reload button.
-->
<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { HEARTBEAT_MS, UNRESPONSIVE_MS } from "../protocol/runtime";
  import type { RunningPlugin } from "../host/RunningPlugin";
  import {
    connectToFrame,
    createSandboxFrame,
    pluginUrl,
  } from "../host/sandbox";
  import {
    currentFrame,
    handleViewRequest,
    sceneFor,
    viewOpened,
  } from "../host/views";
  import { ui } from "../../ui";

  interface Props {
    plugin: RunningPlugin;
    /** The view's name in the manifest. */
    name: string;
    entry: string;
    title: string;
  }

  let { plugin, name, entry, title }: Props = $props();

  /** More messages than this in a second, and the view is closed. */
  const MESSAGE_LIMIT = 2000;

  let container: HTMLDivElement | undefined = $state();
  let stuck = $state(false);
  let cleanup: (() => void)[] = [];

  function mount() {
    if (!container) return;
    stuck = false;
    const frame = createSandboxFrame(pluginUrl(plugin.id, entry), title);
    frame.className = "absolute inset-0 w-full h-full border-0";

    let port: MessagePort | null = null;
    let lastPong = Date.now();
    let closeView: (() => void) | null = null;

    const stopListening = connectToFrame(
      frame,
      () => ({ name }),
      async (newPort) => {
        port?.close();
        closeView?.();
        port = newPort;
        lastPong = Date.now();
        const send = (type: string, payload?: unknown) =>
          newPort.postMessage({ type, payload });
        let second = 0;
        let count = 0;
        newPort.onmessage = (event) => {
          const now = Math.floor(Date.now() / 1000);
          if (now !== second) [second, count] = [now, 0];
          if (++count > MESSAGE_LIMIT) {
            plugin.reportError(`View "${name}" sent too many messages.`);
            stuck = true;
            unmount();
            return;
          }
          const { type, payload } = event.data ?? {};
          if (type === "pong") lastPong = Date.now();
          else handleViewRequest(plugin, name, String(type), payload);
        };
        send("scene", await sceneFor(plugin));
        send("frame", currentFrame());
        closeView = viewOpened({ plugin, name, send });
      },
    );

    const heartbeat = setInterval(() => {
      if (!port) return;
      if (Date.now() - lastPong > UNRESPONSIVE_MS) {
        stuck = true;
        unmount();
        return;
      }
      port.postMessage({ type: "ping" });
    }, HEARTBEAT_MS);

    container.append(frame);
    cleanup = [
      () => clearInterval(heartbeat),
      stopListening,
      () => closeView?.(),
      () => port?.close(),
      () => frame.remove(),
    ];
  }

  function unmount() {
    for (const step of cleanup) step();
    cleanup = [];
  }

  onMount(mount);
  onDestroy(unmount);
</script>

<div class="relative w-full h-full min-h-48" bind:this={container}>
  {#if stuck}
    <div class="absolute inset-0 flex items-center justify-center p-6">
      <div class="{ui.alert.warning} max-w-sm text-sm">
        <p class="mb-3">
          <strong>{title}</strong> from {plugin.manifest.name} stopped responding.
        </p>
        <button class={ui.btnSm.secondary} onclick={mount}>Reload</button>
      </div>
    </div>
  {/if}
</div>
