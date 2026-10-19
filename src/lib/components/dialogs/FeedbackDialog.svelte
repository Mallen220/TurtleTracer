<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    showFeedbackDialog,
    showRatingDialog,
    ratingDialogAutoOpened,
  } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { onDestroy } from "svelte";
  import { CloseIcon, FeedbackIcon, InfoIcon } from "../icons";
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

  let description = $state("");
  let contactInfo = $state("");
  const submission = new WebhookSubmission();
  let cooldownSeconds = $state(0);
  let cooldownInterval: NodeJS.Timeout | null = null;

  // Set the Discord Webhook URL here
  const WEBHOOK_URL = import.meta.env.VITE_DISCORD_ISSUES || "";

  let dialogContainer: HTMLElement | undefined = $state();

  const handleClickOutside = dialogDismissal({
    close: () => closeDialog(),
    busy: () => submission.isSubmitting,
    container: () => dialogContainer,
  });

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
    if (cooldownInterval) clearInterval(cooldownInterval);
  });

  function closeDialog() {
    showFeedbackDialog.set(false);
    // Reset state after transition completes
    setTimeout(() => {
      description = "";
      submission.reset();
    }, 300);
  }

  function openRatingDialog() {
    showFeedbackDialog.set(false);
    ratingDialogAutoOpened.set(false);
    showRatingDialog.set(true);
  }

  async function submitFeedback() {
    if (description.trim().length === 0) {
      submission.fail("Please enter a description.");
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
          title: "New Issue / Feature Request",
          color: 16753920, // Orange
          description:
            description.length > 4000
              ? description.slice(0, 4000) + "..."
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

    if (!(await submission.post(WEBHOOK_URL, payload))) return;

    submission.status = "success";
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
  }
  $effect(() => {
    if ($showFeedbackDialog) {
      // Check cooldown
      const lastSubmitStr = $settingsStore.lastFeedbackSubmit;
      if (lastSubmitStr) {
        const elapsed = Date.now() - Number.parseInt(lastSubmitStr);
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
  });
</script>

{#if $showFeedbackDialog}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="presentation"
    class="{ui.overlay} z-[100]"
    onclick={() => handleClickOutside()}
    transition:fade={{ duration: 150 }}
  >
    <div
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      bind:this={dialogContainer}
      onclick={(e) => {
        e.stopPropagation();
      }}
      class="{ui.dialog} w-full max-w-2xl overflow-hidden"
      in:fly={{ y: 20, duration: 200, delay: 50 }}
      out:fly={{ y: 20, duration: 150 }}
    >
      <!-- Header -->
      <div class={ui.dialogHeader}>
        <h2 class="{ui.title} flex items-center gap-2">
          <FeedbackIcon
            className="w-5 h-5 text-emerald-600 dark:text-emerald-400"
          />
          Report Issue / Feedback / Features
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
          <label for="description" class="{ui.label} block mb-2">
            Describe the issue, feature, or provide feedback
          </label>
          <textarea
            id="description"
            bind:value={description}
            disabled={submission.isSubmitting}
            rows="5"
            placeholder="What's on your mind? Found a bug? Have a suggestion?"
            class="{ui.input} w-full resize-none"
          ></textarea>
          <div
            class="mt-2 flex items-start gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"
          >
            <InfoIcon className="w-4 h-4 flex-shrink-0" />
            <p>
              All data is private and no personal information is sent unless you
              explicitly provide it.
            </p>
          </div>
        </div>

        <div>
          <label for="contactInfo" class="{ui.label} block mb-2">
            Optional Contact Info (Discord / Email)
          </label>
          <input
            id="contactInfo"
            type="text"
            bind:value={contactInfo}
            disabled={submission.isSubmitting}
            placeholder="User#1234 or email@example.com (Optional, only contacted if questions arise)"
            class="{ui.input} w-full"
          />
        </div>

        <SubmissionStatus
          status={submission.status}
          errorMessage={submission.errorMessage}
        />
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-between">
        <div>
          {#if !($settingsStore.submittedRatings && $settingsStore.submittedRatings[pkg.version])}
            <button
              onclick={openRatingDialog}
              disabled={submission.isSubmitting}
              class={ui.link}
            >
              Want to rate the app?
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-3">
          <button
            onclick={closeDialog}
            disabled={submission.isSubmitting}
            class={ui.btn.ghost}
          >
            Cancel
          </button>
          <SubmitButton
            busy={submission.isSubmitting}
            disabled={submission.status === "success" || cooldownSeconds > 0}
            waitLabel={cooldownSeconds > 0
              ? `Wait ${Math.floor(cooldownSeconds / 60) + 1}m`
              : null}
            onclick={submitFeedback}
          />
        </div>
      </div>
    </div>
  </div>
{/if}
