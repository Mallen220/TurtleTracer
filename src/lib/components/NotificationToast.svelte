<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { notification } from "../../stores";
  import { onDestroy } from "svelte";
  import {
    SuccessIcon,
    WarningIcon,
    ErrorIcon,
    InfoIcon,
    CloseIcon,
  } from "./icons";

  let visible = false;
  let currentNotification: import("../../types/index").Notification | null =
    null;
  let timeoutId: any;
  let cleanupTimeoutId: any;

  const unsubscribe = notification.subscribe((n) => {
    if (n) {
      currentNotification = n;
      visible = true;
      // Clear any pending timeouts from previous notifications to prevent race conditions
      if (timeoutId) clearTimeout(timeoutId);
      if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);

      if (n.timeout !== 0) {
        timeoutId = setTimeout(() => {
          visible = false;
          // Clear store after animation
          cleanupTimeoutId = setTimeout(() => {
            notification.set(null);
          }, 300);
        }, n.timeout || 3000);
      }
    } else {
      visible = false;
    }
  });

  onDestroy(() => {
    unsubscribe();
    if (timeoutId) clearTimeout(timeoutId);
    if (cleanupTimeoutId) clearTimeout(cleanupTimeoutId);
  });

  function close() {
    visible = false;
    notification.set(null);
  }

  function getBgColor(type: string) {
    switch (type) {
      case "success":
        return "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/80 dark:border-green-600 dark:text-green-100";
      case "warning":
        return "bg-amber-100 border-amber-500 text-amber-800 dark:bg-amber-900/80 dark:border-amber-600 dark:text-amber-100";
      case "error":
        return "bg-red-100 border-red-500 text-red-800 dark:bg-red-900/80 dark:border-red-600 dark:text-red-100";
      default:
        return "bg-blue-100 border-blue-500 text-blue-800 dark:bg-blue-900/80 dark:border-blue-600 dark:text-blue-100";
    }
  }

  function getIconComponent(type: string) {
    switch (type) {
      case "success":
        return SuccessIcon;
      case "warning":
        return WarningIcon;
      case "error":
        return ErrorIcon;
      default:
        return InfoIcon;
    }
  }
</script>

{#if visible && currentNotification}
  <div
    class="fixed bottom-4 right-4 z-[2000] flex max-w-sm w-full"
    in:fly={{ y: 20, duration: 300 }}
    out:fade={{ duration: 200 }}
  >
    <div
      class="flex items-center w-full px-4 py-3 rounded-lg shadow-lg border-l-4 {getBgColor(
        currentNotification.type,
      )}"
      role="alert"
    >
      <div class="shrink-0 mr-3">
        <svelte:component
          this={getIconComponent(currentNotification.type)}
          className="size-6"
        />
      </div>
      <div class="flex-1 text-sm font-medium">
        {currentNotification.message}
      </div>
      {#if currentNotification && currentNotification.action && currentNotification.actionLabel}
        <button
          on:click={() => {
            const act = currentNotification
              ? currentNotification.action
              : undefined;
            try {
              if (act) act();
            } finally {
              notification.set(null);
            }
          }}
          class="shrink-0 ml-3 px-3 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-sm font-medium hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        >
          {currentNotification.actionLabel}
        </button>
      {/if}
      <button
        on:click={close}
        class="shrink-0 ml-3 p-1 rounded-md hover:bg-black/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
        aria-label="Close notification"
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  </div>
{/if}
