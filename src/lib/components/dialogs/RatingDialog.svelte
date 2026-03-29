<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { showRatingDialog, ratingDialogAutoOpened } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import { StarIcon, CloseIcon, ErrorIcon, SuccessIcon, SpinnerIcon } from "../icons";
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
          <StarIcon className="w-5 h-5 text-yellow-500" />
          Enjoying Turtle Tracer?
        </h2>
        <button
          on:click={closeDialog}
          disabled={isSubmitting}
          class="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors disabled:opacity-50"
          title="Close dialog"
        >
          <CloseIcon className="h-5 w-5" />
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
                <StarIcon
                  className="w-8 h-8 {rating >= star
                    ? 'text-yellow-400'
                    : 'text-neutral-300 dark:text-neutral-600'}"
                  fill={rating >= star ? "currentColor" : "none"}
                />
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
            <ErrorIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        {:else if status === "success"}
          <div
            class="p-3 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-sm rounded-lg flex items-center gap-2 border border-green-200 dark:border-green-900/50"
          >
            <SuccessIcon className="w-5 h-5 flex-shrink-0" />
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
            <SpinnerIcon className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
            Submitting...
          {:else}
            Submit Feedback
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
