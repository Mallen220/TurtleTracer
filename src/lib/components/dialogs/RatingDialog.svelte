<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { showRatingDialog, ratingDialogAutoOpened } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import { settingsStore } from "../../projectStore";
  import { saveSettings } from "../../../utils/settingsPersistence";
  import pkg from "../../../../package.json";

  let rating = 0;
  let description = "";
  let isSubmitting = false;
  let status: "idle" | "success" | "error" = "idle";
  let errorMessage = "";

  // Rating webhook URL
  const WEBHOOK_URL = import.meta.env.VITE_DISCORD_RATINGS || "";

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

  $: isAlreadyRated = !!(
    $settingsStore.submittedRatings &&
    $settingsStore.submittedRatings[pkg.version]
  );

  $: if ($showRatingDialog && isAlreadyRated) {
    showRatingDialog.set(false);
  }

  onDestroy(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  function closeDialog() {
    showRatingDialog.set(false);
    // Reset state after transition completes
    setTimeout(() => {
      rating = 0;
      description = "";
      status = "idle";
      errorMessage = "";
    }, 300);
  }

  async function submitFeedback() {
    if (rating === 0) {
      errorMessage = "Please select a rating.";
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
            title: "New Rating Received",
            color: rating <= 2 ? 16711680 : rating === 3 ? 16753920 : 65280, // Red for low, Yellow for medium, Green for high
            fields: [
              {
                name: "Rating",
                value: "⭐".repeat(rating) + " (" + rating + "/5)",
                inline: true,
              },
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

      if (description.trim().length > 0) {
        payload.embeds[0].fields.push({
          name: "Additional Feedback",
          value:
            description.length > 1000
              ? description.substring(0, 1000) + "..."
              : description,
          inline: false,
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
        settingsStore.update((s) => {
          const newRatings = { ...(s.submittedRatings || {}) };
          newRatings[pkg.version] = true;
          return { ...s, submittedRatings: newRatings };
        });
        saveSettings($settingsStore).catch((e) =>
          console.error("Failed to save submitted ratings", e),
        );

        status = "success";
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
  function dismissRating() {
    settingsStore.update((s) => {
      const newDismissals = { ...(s.dismissedRatings || {}) };
      newDismissals[pkg.version] = true;
      return { ...s, dismissedRatings: newDismissals };
    });
    saveSettings($settingsStore).catch((e) =>
      console.error("Failed to save dismissed ratings", e),
    );
    closeDialog();
  }
</script>

{#if $showRatingDialog && !isAlreadyRated}


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
      class="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-neutral-200 dark:border-neutral-700"
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
            class="w-5 h-5 text-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
            />
          </svg>
          Enjoying Turtle Tracer?
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
          <div
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            Rate your experience
          </div>
          <div class="flex items-center gap-2">
            {#each [1, 2, 3, 4, 5] as star}
              <button
                type="button"
                on:click={() => (rating = star)}
                disabled={isSubmitting}
                class="hover:scale-110 transition-transform focus:outline-none disabled:opacity-50"
                aria-label="{star} star rating"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={rating >= star ? "currentColor" : "none"}
                  stroke="currentColor"
                  stroke-width="1.5"
                  class="w-8 h-8 {rating >= star
                    ? 'text-yellow-400'
                    : 'text-neutral-300 dark:text-neutral-600'}"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
                  />
                </svg>
              </button>
            {/each}
            <span
              class="ml-2 text-sm font-medium {rating > 0
                ? 'text-neutral-700 dark:text-neutral-300'
                : 'text-neutral-400'}"
            >
              {rating === 0 ? "Select rating" : `${rating} / 5`}
            </span>
          </div>
        </div>

        <div>
          <label
            for="description"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2"
          >
            What could we improve? (Optional)
          </label>
          <textarea
            id="description"
            bind:value={description}
            disabled={isSubmitting}
            rows="3"
            placeholder="Feedback is appreciated!"
            class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 resize-none"
          ></textarea>
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
        class="px-6 py-4 border-t border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 flex justify-end gap-3"
      >
        {#if $ratingDialogAutoOpened}
          <div class="flex-1 flex justify-start">
            <button
              on:click={dismissRating}
              disabled={isSubmitting}
              class="px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500/50 disabled:opacity-50"
            >
              Not interested
            </button>
          </div>
        {/if}
        <button
          on:click={closeDialog}
          disabled={isSubmitting}
          class="px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500/50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          on:click={submitFeedback}
          disabled={isSubmitting || status === "success"}
          class="px-5 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-900/20 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50 flex items-center gap-2"
        >
          {#if isSubmitting}
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
{/if}
