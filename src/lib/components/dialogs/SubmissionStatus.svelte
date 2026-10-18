<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ErrorIcon, SuccessIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    status: "idle" | "success" | "error";
    errorMessage: string;
  }

  let { status, errorMessage }: Props = $props();
</script>

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
