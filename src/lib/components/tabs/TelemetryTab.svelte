<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import {
    telemetryState,
    isConnected,
    telemetryLines,
    processTelemetryMessage,
    setStatus,
  } from "../../telemetryStore";
  import { notification } from "../../../stores";

  // Inputs
  let ip = "192.168.43.1";
  let port = 8082;
  let connecting = false;

  $: status = $telemetryState.status;
  $: fps = $telemetryState.fps;
  $: lines = $telemetryLines;

  // Sort keys alphabetically
  $: sortedKeys = Object.keys(lines).sort();

  // Listen for IPC events
  let cleanupListeners: (() => void) | null = null;

  onMount(() => {
    const api = (window as any).electronAPI;
    if (api && api.telemetry) {
      // Set up listeners
      // Note: In strict mode, we might duplicate listeners if not careful,
      // but Electron IPC listeners usually stack. We should clear them on destroy if possible.
      // electronAPI.onData returns a callback? No, it registers.
      // The preload script implementation:
      // onData: (callback) => ipcRenderer.on('telemetry:data', ...)
      // This adds a listener. We can't easily remove it unless preload exposed a removeListener.
      // Assuming single instance of TelemetryTab for now.
      // But if user switches tabs and component unmounts?
      // Listeners might accumulate.
      // Ideally preload should return a cleanup function or allow removeListener.
      // For now, let's assume it persists or just accept overhead.
      // Actually, if we add listener every mount, we get multiple callbacks.
      // We should check if listeners are already set up?
      // Or move the listeners to a central place (e.g. App.svelte or telemetryStore).
      // Moving to telemetryStore is better if possible, but store shouldn't know about electronAPI directly if we want to keep it pure?
      // Actually `processTelemetryMessage` is exported.
      // Let's set up listeners once in `App.svelte` or `ControlTab.svelte`?
      // Or here, but guard it.
      // Since `TelemetryTab` is mounted/unmounted when switching tabs in `ControlTab`, putting listeners here is bad (leak).
      // I should move listener setup to `ControlTab` or `App`.
      // `ControlTab` is always present even if tab content is hidden?
      // In `ControlTab.svelte`:
      // `{#each $tabRegistry as tab ...}`
      //   `<div class:hidden={activeTab !== tab.id} ...>`
      //     `<svelte:component ... />`
      //   `</div>`
      // So components ARE kept alive (just hidden).
      // So `onMount` only runs once!
      // Great.

      api.telemetry.onData((data: string) => {
        processTelemetryMessage(data);
      });

      api.telemetry.onStatus((s: any) => {
        setStatus(s);
        // Sync connecting state
        if (s === 'CONNECTED' || s === 'DISCONNECTED' || s === 'ERROR') {
             connecting = false;
        }
      });
    }
  });

  async function toggleConnection() {
    const api = (window as any).electronAPI;
    if (!api || !api.telemetry) {
      notification.set({
        message: "Telemetry API not available",
        type: "error",
      });
      return;
    }

    if ($isConnected) {
      await api.telemetry.disconnect();
    } else {
      if (connecting) return;
      connecting = true;
      try {
        await api.telemetry.connect(ip, port);
      } catch (e) {
        console.error(e);
        notification.set({
          message: "Connection request failed",
          type: "error",
        });
        connecting = false;
      }
    }
  }
</script>

<div class="p-4 w-full flex flex-col gap-4 h-full">
  <!-- Connection Controls -->
  <div
    class="flex flex-col gap-2 p-4 bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700"
  >
    <h3 class="font-semibold text-lg text-neutral-800 dark:text-neutral-100">
      Connection
    </h3>
    <div class="flex gap-2 items-center">
      <input
        type="text"
        bind:value={ip}
        placeholder="IP Address"
        class="flex-1 px-3 py-2 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm dark:text-white"
        disabled={$isConnected}
      />
      <input
        type="number"
        bind:value={port}
        placeholder="Port"
        class="w-24 px-3 py-2 bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm dark:text-white"
        disabled={$isConnected}
      />
    </div>
    <button
      on:click={toggleConnection}
      class="w-full py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
            {$isConnected
        ? 'bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500'
        : 'bg-purple-600 text-white hover:bg-purple-700 focus:ring-purple-500'}"
      disabled={connecting}
    >
      {#if connecting}
        Connecting...
      {:else if $isConnected}
        Disconnect
      {:else}
        Connect
      {/if}
    </button>

    <!-- Status Indicator -->
    <div class="flex justify-between items-center text-xs mt-1">
      <div class="flex items-center gap-1.5">
        <div
          class="w-2 h-2 rounded-full {status === 'CONNECTED'
            ? 'bg-green-500'
            : status === 'CONNECTING'
              ? 'bg-yellow-500 animate-pulse'
              : status === 'ERROR'
                ? 'bg-red-500'
                : 'bg-neutral-400'}"
        ></div>
        <span class="font-medium text-neutral-600 dark:text-neutral-400"
          >{status}</span
        >
      </div>
      {#if $isConnected}
        <span class="text-neutral-500">{fps} FPS</span>
      {/if}
    </div>
  </div>

  <!-- Data Table -->
  <div
    class="flex-1 overflow-hidden flex flex-col bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700"
  >
    <div
      class="p-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50"
    >
      <h3
        class="font-semibold text-sm text-neutral-700 dark:text-neutral-300"
      >
        Telemetry Data
      </h3>
    </div>
    <div class="flex-1 overflow-y-auto p-2">
      {#if sortedKeys.length === 0}
        <div
          class="h-full flex items-center justify-center text-neutral-400 text-sm italic"
        >
          No data received
        </div>
      {:else}
        <table class="w-full text-sm">
          <tbody>
            {#each sortedKeys as key}
              <tr
                class="border-b border-neutral-100 dark:border-neutral-800 last:border-0 hover:bg-neutral-50 dark:hover:bg-neutral-700/30 transition-colors"
              >
                <td
                  class="py-1.5 px-2 font-medium text-neutral-600 dark:text-neutral-400 w-1/3 truncate"
                  title={key}>{key}</td
                >
                <td
                  class="py-1.5 px-2 text-neutral-900 dark:text-neutral-200 font-mono text-right truncate"
                >
                  {#if typeof lines[key] === "boolean"}
                    <span
                      class="inline-block w-2.5 h-2.5 rounded-full {lines[key]
                        ? 'bg-green-500'
                        : 'bg-red-500'}"
                    ></span>
                  {:else if typeof lines[key] === "number"}
                    {Number(lines[key]).toFixed(3)}
                  {:else}
                    {lines[key]}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </div>
</div>
