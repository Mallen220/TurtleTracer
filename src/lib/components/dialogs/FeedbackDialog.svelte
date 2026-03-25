<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    showFeedbackDialog,
    showRatingDialog,
    ratingDialogAutoOpened,
  } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import { settingsStore } from "../../projectStore";
  import { saveSettings } from "../../../utils/settingsPersistence";
  import pkg from "../../../../package.json";

  let description = "";
  let contactInfo = "";
  let isSubmitting = false;
  let status: "idle" | "success" | "error" = "idle";
  let errorMessage = "";
  let cooldownSeconds = 0;
  let cooldownInterval: NodeJS.Timeout | null = null;

  // Set the Discord Webhook URL here
  const WEBHOOK_URL = import.meta.env.VITE_DISCORD_ISSUES || "";

  let dialogContainer: HTMLElement;

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && !isSubmitting) {
      closeDialog();
    }
  }

  function handleClickOutside(event?: Event) {
    if (
      dialogContainer &&
      (!event || !dialogContainer.contains(event.target as Node)) &&
      !isSubmitting
    ) {
      closeDialog();
    }
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  $: if ($showFeedbackDialog) {
    // Check cooldown
    const lastSubmitStr = $settingsStore.lastFeedbackSubmit;
    if (lastSubmitStr) {
      const elapsed = Date.now() - parseInt(lastSubmitStr);
      if (elapsed < 300000) {
        cooldownSeconds = Math.ceil((300000 - elapsed) / 1000);
        startCooldownTimer();
      } else {
        cooldownSeconds = 0;
      }
    } else {
      cooldownSeconds = 0;
    }
  }

  function startCooldownTimer() {
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = setInterval(() => {
      cooldownSeconds--;
      if (cooldownSeconds <= 0) {
        if (cooldownInterval) clearInterval(cooldownInterval);
        cooldownSeconds = 0;
      }
    }, 1000);
  }

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
    if (cooldownInterval) clearInterval(cooldownInterval);
  });

  function closeDialog() {
    showFeedbackDialog.set(false);
    // Reset state after transition completes
    setTimeout(() => {
      description = "";
      status = "idle";
      errorMessage = "";
    }, 300);
  }

  function openRatingDialog() {
    showFeedbackDialog.set(false);
    ratingDialogAutoOpened.set(false);
    showRatingDialog.set(true);
  }

  async function submitFeedback() {
    if (description.trim().length === 0) {
      errorMessage = "Please enter a description.";
      status = "error";
      return;
    }

    if (!WEBHOOK_URL) {
      errorMessage = "Webhook URL is not configured. Feedback cannot be sent.";
      status = "error";
      return;
    }

    isSubmitting = true;
    status = "idle";
    errorMessage = "";

    try {
      const payload = {
        embeds: [
          {
            title: "New Issue / Feature Request",
            color: 16753920, // Orange
            description:
              description.length > 4000
                ? description.substring(0, 4000) + "..."
                : description,
            fields: [
              {
                name: "Version",
                value: `v${pkg.version}`,
                inline: true,
              },
            ],
            footer: {
              text: "Turtle Tracer Feedback",
            },
            timestamp: new Date().toISOString(),
          },
        ],
      };

      if (contactInfo.trim().length > 0) {
        payload.embeds[0].fields.push({
          name: "Contact Info",
          value: contactInfo.trim(),
          inline: true,
        });
      }

      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        status = "success";
        settingsStore.update((s) => ({
          ...s,
          lastFeedbackSubmit: Date.now().toString(),
        }));
        saveSettings($settingsStore).catch((e) =>
          console.error("Failed to save lastFeedbackSubmit", e),
        );
        setTimeout(() => {
          closeDialog();
        }, 2000);
      } else {
        throw new Error(`Failed to send: ${response.status}`);
      }
    } catch (e: any) {
      errorMessage = e.message || "An unknown error occurred.";
      status = "error";
    } finally {
      isSubmitting = false;
    }
  }
</script>

{#if $showFeedbackDialog}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <div
    role="presentation"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    on:click={() => handleClickOutside()}
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      bind:this={dialogContainer}
      on:click|stopPropagation
      class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-neutral-200 dark:border-neutral-700"
      in:fly={{ y: 20, duration: 200, delay: 50 }}
      out:fly={{ y: 20, duration: 150 }}
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50"
      >
        <h2
          class="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-5 h-5 text-purple-600 dark:text-purple-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
            />
          </svg>
          Report Issue / Feedback / Features
        </h2>
        <button
          on:click={closeDialog}
          disabled={isSubmitting}
          class="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors disabled:opacity-50"
          title="Close dialog"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="px-6 py-5 space-y-6">
        <div>
          <label
            for="description"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Describe the issue, feature, or provide feedback
          </label>
          <textarea
            id="description"
            bind:value={description}
            disabled={isSubmitting}
            rows="5"
            placeholder="What's on your mind? Found a bug? Have a suggestion?"
            class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 resize-none"
          ></textarea>
          <div
            class="mt-2 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-4 h-4 flex-shrink-0"
            >
              <path
                fill-rule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                clip-rule="evenodd"
              />
            </svg>
            <p>
              All data is private and no personal information is sent unless you
              explicitly provide it.
            </p>
          </div>
        </div>

        <div>
          <label
            for="contactInfo"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Optional Contact Info (Discord / Email)
          </label>
          <input
            id="contactInfo"
            type="text"
            bind:value={contactInfo}
            disabled={isSubmitting}
            placeholder="User#1234 or email@example.com (Optional, only contacted if questions arise)"
            class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
          />
        </div>

        {#if status === "error"}
          <div
            class="p-3 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-sm rounded-lg flex items-start gap-2 border border-red-200 dark:border-red-900/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-5 h-5 flex-shrink-0 mt-0.5"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.361a.75.75 0 0 1-1.5 0v-.5c0-.83.67-1.5 1.5-1.5a1.5 1.5 0 1 0-1.415-2.262v-.001Zm-.75 6.559a1 1 0 1 0 2 0 1 1 0 0 0-2 0Z"
                clip-rule="evenodd"
              />
            </svg>
            <p>{errorMessage}</p>
          </div>
        {:else if status === "success"}
          <div
            class="p-3 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-sm rounded-lg flex items-center gap-2 border border-green-200 dark:border-green-900/50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-5 h-5 flex-shrink-0"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                clip-rule="evenodd"
              />
            </svg>
            <p>Feedback sent successfully! Thank you.</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 flex items-center justify-between gap-3"
      >
        <div>
          {#if !($settingsStore.submittedRatings && $settingsStore.submittedRatings[pkg.version])}
            <button
              on:click={openRatingDialog}
              disabled={isSubmitting}
              class="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors focus:outline-none hover:underline disabled:opacity-50"
            >
              Want to rate the app?
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-3">
          <button
            on:click={closeDialog}
            disabled={isSubmitting}
            class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            on:click={submitFeedback}
            disabled={isSubmitting ||
              status === "success" ||
              cooldownSeconds > 0}
            class="px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 flex items-center gap-2"
          >
            {#if cooldownSeconds > 0}
              Wait {Math.floor(cooldownSeconds / 60) + 1}m
            {:else if isSubmitting}
              <svg
                class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  class="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  stroke-width="4"
                ></circle>
                <path
                  class="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Submitting...
            {:else}
              Submit Feedback
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
