// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What the feedback and rating dialogs share: sending a message to a Discord
// webhook and closing the dialog.
import { onMount } from "svelte";

/** The progress of sending one message, for the dialog to show. */
export class WebhookSubmission {
  isSubmitting = $state(false);
  status: "idle" | "success" | "error" = $state("idle");
  errorMessage = $state("");

  fail(message: string) {
    this.errorMessage = message;
    this.status = "error";
  }

  reset() {
    this.status = "idle";
    this.errorMessage = "";
  }

  /** Posts `payload` as JSON. Returns whether the webhook accepted it, showing the error if not. */
  async post(url: string, payload: unknown): Promise<boolean> {
    this.isSubmitting = true;
    this.reset();
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(`Failed to send: ${response.status}`);
      return true;
    } catch (e: any) {
      this.fail(e.message || "An unknown error occurred.");
      return false;
    } finally {
      this.isSubmitting = false;
    }
  }
}

/**
 * Closes the dialog on Escape, and returns a handler for clicks on its
 * backdrop. Neither closes it while `busy()`. Call while the dialog is set up.
 */
export function dialogDismissal(options: {
  close: () => void;
  busy: () => boolean;
  container: () => HTMLElement | undefined;
}) {
  onMount(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !options.busy()) options.close();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  });

  return function handleClickOutside(event?: Event) {
    const container = options.container();
    if (
      container &&
      (!event || !container.contains(event.target as Node)) &&
      !options.busy()
    ) {
      options.close();
    }
  };
}
