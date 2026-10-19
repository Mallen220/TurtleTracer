<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { SpinnerIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    /** True while the message is being sent. */
    busy: boolean;
    disabled?: boolean;
    /** Shown instead of the usual label, for example while waiting out a cooldown. */
    waitLabel?: string | null;
    onclick: () => void;
  }

  let { busy, disabled = false, waitLabel = null, onclick }: Props = $props();
</script>

<button {onclick} disabled={busy || disabled} class={ui.btn.primary}>
  {#if waitLabel}
    {waitLabel}
  {:else if busy}
    <SpinnerIcon className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
    Submitting...
  {:else}
    Submit Feedback
  {/if}
</button>
