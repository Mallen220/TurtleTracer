<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    showFeedbackDialog,
    showRatingDialog,
    ratingDialogAutoOpened,
  } from "../../../stores";
  import { fade, fly } from "svelte/transition";
  import { onMount, onDestroy } from "svelte";
  import {
    CloseIcon,
    FeedbackIcon,
    InfoIcon,
    ErrorIcon,
    SuccessIcon,
    SpinnerIcon,
  } from "../icons";
  import { settingsStore } from "../../projectStore";
  import { saveSettings } from "../../../utils/settingsPersistence";
  import pkg from "../../../../package.json";
  import { ui } from "../../ui";

  let description = $state("");
  let contactInfo = $state("");
  let isSubmitting = $state(false);
  let status: "idle" | "success" | "error" = $state("idle");
  let errorMessage = $state("");
  let cooldownSeconds = $state(0);
  let cooldownInterval: NodeJS.Timeout | null = null;

  // Set the Discord Webhook URL here
  const WEBHOOK_URL = import.meta.env.VITE_DISCORD_ISSUES || "";

  let dialogContainer: HTMLElement | undefined = $state();

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
            className="w-5 h-5 text-purple-600 dark:text-purple-400"
          />
          Report Issue / Feedback / Features
        </h2>
        <button
          aria-label="Close dialog"
          onclick={closeDialog}
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
          <label for="description" class="{ui.label} block mb-2">
            Describe the issue, feature, or provide feedback
          </label>
          <textarea
            id="description"
            bind:value={description}
            disabled={isSubmitting}
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
            disabled={isSubmitting}
            placeholder="User#1234 or email@example.com (Optional, only contacted if questions arise)"
            class="{ui.input} w-full"
          />
        </div>

        {#if status === "error"}
          <div class="{ui.alert.danger} flex items-start gap-2">
            <ErrorIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        {:else if status === "success"}
          <div class="{ui.alert.success} flex items-center gap-2">
            <SuccessIcon className="w-5 h-5 flex-shrink-0" />
            <p>Feedback sent successfully! Thank you.</p>
          </div>
        {/if}
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-between">
        <div>
          {#if !($settingsStore.submittedRatings && $settingsStore.submittedRatings[pkg.version])}
            <button
              onclick={openRatingDialog}
              disabled={isSubmitting}
              class={ui.link}
            >
              Want to rate the app?
            </button>
          {/if}
        </div>
        <div class="flex items-center gap-3">
          <button
            onclick={closeDialog}
            disabled={isSubmitting}
            class={ui.btn.ghost}
          >
            Cancel
          </button>
          <button
            onclick={submitFeedback}
            disabled={isSubmitting ||
              status === "success" ||
              cooldownSeconds > 0}
            class={ui.btn.primary}
          >
            {#if cooldownSeconds > 0}
              Wait {Math.floor(cooldownSeconds / 60) + 1}m
            {:else if isSubmitting}
              <SpinnerIcon
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              />
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
