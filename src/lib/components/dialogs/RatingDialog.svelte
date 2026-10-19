<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { showRatingDialog, ratingDialogAutoOpened } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { StarIcon, CloseIcon } from "../icons";
  import SubmitButton from "./SubmitButton.svelte";
  import SubmissionStatus from "./SubmissionStatus.svelte";
  import {
    WebhookSubmission,
    dialogDismissal,
  } from "./webhookSubmission.svelte";
  import { settingsStore } from "../../projectStore";
  import { saveSettings } from "../../../utils/settingsPersistence";
  import pkg from "../../../../package.json";
  import { ui } from "../../ui";

  let rating = $state(0);
  let description = $state("");
  const submission = new WebhookSubmission();

  // Rating webhook URL
  const WEBHOOK_URL = import.meta.env.VITE_DISCORD_RATINGS || "";

  let dialogContainer: HTMLElement | undefined = $state();

  const handleClickOutside = dialogDismissal({
    close: () => closeDialog(),
    busy: () => submission.isSubmitting,
    container: () => dialogContainer,
  });

  let isAlreadyRated = $derived(
    !!(
      $settingsStore.submittedRatings &&
      $settingsStore.submittedRatings[pkg.version]
    ),
  );

  $effect(() => {
    if ($showRatingDialog && isAlreadyRated) {
      showRatingDialog.set(false);
    }
  });

  function closeDialog() {
    if ($ratingDialogAutoOpened) {
      settingsStore.update((s) => {
        const newDismissals = { ...(s.dismissedRatings || {}) };
        newDismissals[pkg.version] = true;
        return { ...s, dismissedRatings: newDismissals };
      });
      saveSettings($settingsStore).catch((e) =>
        console.error("Failed to save dismissed ratings", e),
      );
      ratingDialogAutoOpened.set(false);
    }

    showRatingDialog.set(false);
    // Reset state after transition completes
    setTimeout(() => {
      rating = 0;
      description = "";
      submission.reset();
    }, 300);
  }

  async function submitFeedback() {
    if (rating === 0) {
      submission.fail("Please select a rating.");
      return;
    }

    if (!WEBHOOK_URL) {
      submission.fail(
        "Webhook URL is not configured. Feedback cannot be sent.",
      );
      return;
    }

    const payload = {
      embeds: [
        {
          title: "New Rating Received",
          color: rating <= 2 ? 16711680 : rating === 3 ? 16753920 : 65280, // Red for low, Yellow for medium, Green for high
          fields: [
            {
              name: "Rating",
              value: "Stars: " + rating + " / 5",
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
            ? description.slice(0, 1000) + "..."
            : description,
        inline: false,
      });
    }

    if (!(await submission.post(WEBHOOK_URL, payload))) return;

    settingsStore.update((s) => {
      const newRatings = { ...(s.submittedRatings || {}) };
      newRatings[pkg.version] = true;
      return { ...s, submittedRatings: newRatings };
    });
    saveSettings($settingsStore).catch((e) =>
      console.error("Failed to save submitted ratings", e),
    );

    submission.status = "success";
    setTimeout(() => {
      closeDialog();
    }, 2000);
  }

  function dismissRating() {
    settingsStore.update((s) => {
      const newDismissals = { ...(s.dismissedRatings || {}) };
      newDismissals["all"] = true;
      return { ...s, dismissedRatings: newDismissals };
    });
    saveSettings($settingsStore).catch((e) =>
      console.error("Failed to save dismissed ratings", e),
    );
    ratingDialogAutoOpened.set(false);
    closeDialog();
  }
</script>

{#if $showRatingDialog && !isAlreadyRated}
  <div
    role="presentation"
    class="{ui.overlay} z-[100]"
    onclick={() => handleClickOutside()}
    transition:fade={{ duration: 150 }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      bind:this={dialogContainer}
      onclick={(e) => {
        e.stopPropagation();
      }}
      class="{ui.dialog} w-full max-w-md overflow-hidden"
      in:fly={{ y: 20, duration: 200, delay: 50 }}
      out:fly={{ y: 20, duration: 150 }}
    >
      <!-- Header -->
      <div class={ui.dialogHeader}>
        <h2 class="{ui.title} flex items-center gap-2">
          <StarIcon className="w-5 h-5 text-yellow-500" />
          Enjoying Turtle Tracer?
        </h2>
        <button
          aria-label="Close dialog"
          onclick={closeDialog}
          disabled={submission.isSubmitting}
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
                onclick={() => (rating = star)}
                disabled={submission.isSubmitting}
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
                : 'text-neutral-500 dark:text-neutral-400'}"
            >
              {rating === 0 ? "Select rating" : `${rating} / 5`}
            </span>
          </div>
        </div>

        <div>
          <label for="description" class="{ui.label} block mb-2">
            What could we improve? (Optional)
          </label>
          <textarea
            id="description"
            bind:value={description}
            disabled={submission.isSubmitting}
            rows="3"
            placeholder="Feedback is appreciated!"
            class="{ui.input} w-full resize-none"
          ></textarea>
        </div>

        <SubmissionStatus
          status={submission.status}
          errorMessage={submission.errorMessage}
        />
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-end">
        {#if $ratingDialogAutoOpened}
          <div class="flex-1 flex justify-start">
            <button
              onclick={dismissRating}
              disabled={submission.isSubmitting}
              class={ui.btn.ghost}
            >
              Never ask again
            </button>
          </div>
        {/if}
        <button
          onclick={closeDialog}
          disabled={submission.isSubmitting}
          class={ui.btn.ghost}
        >
          Cancel
        </button>
        <SubmitButton
          busy={submission.isSubmitting}
          disabled={submission.status === "success"}
          onclick={submitFeedback}
        />
      </div>
    </div>
  </div>
{/if}
