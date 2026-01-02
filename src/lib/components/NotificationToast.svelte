<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { notification } from "../../stores";
  import { onDestroy } from "svelte";

  let visible = false;
  let currentNotification: import("../../types").Notification | null = null;
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

  function getIcon(type: string) {
    switch (type) {
      case "success":
        return `<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />`;
      case "warning":
        return `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />`;
      case "error":
        return `<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />`;
      default:
        return `<path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />`;
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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          {@html getIcon(currentNotification.type)}
        </svg>
      </div>
      <div class="flex-1 text-sm font-medium">
        {currentNotification.message}
      </div>
      <button
        on:click={close}
        class="shrink-0 ml-3 p-1 rounded-md hover:bg-black/10 transition-colors"
        aria-label="Close notification"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18 18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  </div>
{/if}
