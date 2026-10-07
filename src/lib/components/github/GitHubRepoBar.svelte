<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Shown above the file list while browsing a GitHub repository. -->
<script lang="ts">
  import { pathInMessage } from "../../../utils/messagePaths";
  import { notification } from "../../../stores";
  import { saveCopiesOnDevice } from "../../../utils/github/copies";
  import { repoKey, type RepoRef } from "../../../utils/github/paths";
  import {
    githubRepos,
    OTHER_TAB_MESSAGE,
    type Resolution,
    type UpdateResult,
  } from "../../../utils/github/repos";
  import { clearGitHubToken, githubToken } from "../../../utils/github/token";
  import { GithubIcon } from "../icons";
  import GitHubCommitDialog from "./GitHubCommitDialog.svelte";
  import GitHubConflicts from "./GitHubConflicts.svelte";

  interface Props {
    repo: RepoRef;
    /** Back to this device's files. */
    onleave: () => void;
    /** The working copy changed: refresh the file list. */
    onchanged: (update?: UpdateResult) => void;
  }

  let { repo, onleave, onchanged }: Props = $props();

  const summaries = githubRepos.summaries;
  const editable = githubRepos.editable;
  let summary = $derived($summaries.find((s) => repoKey(s) === repoKey(repo)));
  let changeCount = $derived(summary?.changeCount ?? 0);

  let busy = $state(false);
  let showCommit = $state(false);
  let showMenu = $state(false);
  let conflicts: string[] = $state([]);
  /** Branches to move to, while choosing one. */
  let branches: string[] | null = $state(null);
  let chosenBranch = $state("");
  /** The branch the conflicts came from, if switching rather than updating. */
  let switchingTo: string | null = $state(null);

  function notify(
    message: string,
    type: "success" | "error" | "warning" | "info" = "info",
  ) {
    notification.set({
      message,
      type,
      timeout: type === "error" ? 8000 : 4000,
    });
  }

  const errorText = (e: unknown) =>
    e instanceof Error ? e.message : String(e);

  function finished(result: UpdateResult, done: string) {
    if (result.status === "conflicts") {
      conflicts = result.conflicts;
      return;
    }
    conflicts = [];
    switchingTo = null;
    if (result.status === "updated" && result.copies.length > 0) {
      notify(
        `${done}. Your versions were kept next to GitHub's as "(my version)".`,
        "success",
      );
    } else {
      notify(
        result.status === "up-to-date"
          ? "Already up to date with GitHub"
          : done,
        "success",
      );
    }
    onchanged(result);
  }

  async function update(resolve?: Resolution) {
    busy = true;
    try {
      finished(await githubRepos.update(repo, resolve), "Updated from GitHub");
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      busy = false;
    }
  }

  async function chooseBranch() {
    showMenu = false;
    busy = true;
    try {
      branches = (await githubRepos.listBranches(repo)).filter(
        (b) => b !== summary?.branch,
      );
      chosenBranch = branches[0] ?? "";
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      busy = false;
    }
  }

  async function switchBranch(branch: string, resolve?: Resolution) {
    busy = true;
    switchingTo = branch;
    try {
      const result = await githubRepos.switchBranch(repo, branch, resolve);
      if (result.status !== "conflicts") branches = null;
      finished(result, `Moved to ${branch}`);
    } catch (e) {
      notify(errorText(e), "error");
    } finally {
      busy = false;
    }
  }

  function resolve(resolution: Resolution) {
    if (switchingTo) void switchBranch(switchingTo, resolution);
    else void update(resolution);
  }

  async function saveCopies() {
    showMenu = false;
    try {
      const { folder, count } = await saveCopiesOnDevice(repo);
      notify(
        count === 0
          ? "There are no edited files to copy."
          : `Copied ${count} edited file${count === 1 ? "" : "s"} to ${pathInMessage(folder)}`,
        "success",
      );
    } catch (e) {
      notify(errorText(e), "error");
    }
  }

  async function discardAll() {
    showMenu = false;
    if (
      !confirm(
        `Throw away all ${changeCount} uncommitted change${changeCount === 1 ? "" : "s"} in ${repoKey(repo)}?`,
      )
    ) {
      return;
    }
    try {
      await githubRepos.discard(repo);
      onchanged();
    } catch (e) {
      notify(errorText(e), "error");
    }
  }

  async function closeRepo() {
    showMenu = false;
    if (
      changeCount > 0 &&
      !confirm(
        `${repoKey(repo)} has ${changeCount} uncommitted change${changeCount === 1 ? "" : "s"}. Close it and throw them away? Use "Save copies on this device" first to keep them.`,
      )
    ) {
      return;
    }
    try {
      await githubRepos.close(repo);
      onleave();
    } catch (e) {
      notify(errorText(e), "error");
    }
  }

  const menuItem =
    "px-4 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 disabled:opacity-50";
</script>

<div
  class="px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 flex flex-col gap-2"
>
  <div class="flex items-center gap-2 text-xs">
    <GithubIcon
      className="size-4 shrink-0 text-neutral-700 dark:text-neutral-300"
    />
    <span
      class="font-semibold text-neutral-800 dark:text-neutral-100 truncate"
      title={repoKey(repo)}>{repoKey(repo)}</span
    >
    {#if summary}
      <span
        class="shrink-0 px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 font-mono"
        >{summary.branch}</span
      >
    {/if}
    <span class="flex-1"></span>
    <button
      onclick={() => update()}
      disabled={busy || !$editable}
      class="shrink-0 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 hover:bg-white dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-200 disabled:opacity-50"
      title="Get the latest version from GitHub">Update</button
    >
    <button
      onclick={() => (showCommit = true)}
      disabled={changeCount === 0}
      class="shrink-0 px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium disabled:opacity-50"
      title={changeCount
        ? "Send your changes to GitHub"
        : "Nothing to commit yet"}
      >Commit{changeCount ? ` (${changeCount})` : ""}</button
    >
    <div class="relative shrink-0">
      <button
        onclick={() => (showMenu = !showMenu)}
        class="px-1.5 py-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-300"
        aria-label="More repository actions"
        aria-haspopup="true"
        aria-expanded={showMenu}>⋯</button
      >
      {#if showMenu}
        <div
          class="absolute right-0 top-full mt-1 w-60 z-[100] bg-white dark:bg-neutral-800 rounded-md shadow-xl border border-neutral-200 dark:border-neutral-700 py-1 flex flex-col text-sm"
        >
          <a
            href={`https://github.com/${repoKey(repo)}/tree/${summary?.branch ?? ""}`}
            target="_blank"
            rel="noopener noreferrer"
            onclick={() => (showMenu = false)}
            class={menuItem}>View on GitHub</a
          >
          <button onclick={chooseBranch} disabled={!$editable} class={menuItem}
            >Switch branch…</button
          >
          <button
            onclick={saveCopies}
            disabled={changeCount === 0}
            class={menuItem}>Save copies on this device</button
          >
          <button
            onclick={() => {
              showMenu = false;
              onleave();
            }}
            class={menuItem}>Show this device's files</button
          >
          {#if $githubToken}
            <button
              onclick={() => {
                showMenu = false;
                void clearGitHubToken();
              }}
              class={menuItem}>Forget GitHub token</button
            >
          {/if}
          <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
          <button
            onclick={discardAll}
            disabled={changeCount === 0 || !$editable}
            class="{menuItem} !text-red-600 dark:!text-red-400"
            >Discard all changes</button
          >
          <button
            onclick={closeRepo}
            disabled={!$editable}
            class="{menuItem} !text-red-600 dark:!text-red-400"
            >Close repository</button
          >
        </div>
      {/if}
    </div>
  </div>

  {#if !$editable}
    <p class="text-xs text-amber-700 dark:text-amber-300" role="status">
      {OTHER_TAB_MESSAGE}
    </p>
  {/if}

  {#if branches}
    <div class="flex items-center gap-2 text-xs">
      {#if branches.length === 0}
        <span class="text-neutral-600 dark:text-neutral-400"
          >There are no other branches.</span
        >
      {:else}
        <label
          class="flex items-center gap-2 text-neutral-700 dark:text-neutral-300"
        >
          Take your changes to
          <select
            bind:value={chosenBranch}
            class="px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 font-mono"
          >
            {#each branches as name (name)}
              <option value={name}>{name}</option>
            {/each}
          </select>
        </label>
        <button
          onclick={() => switchBranch(chosenBranch)}
          disabled={busy || !chosenBranch}
          class="px-2 py-1 rounded bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 font-medium disabled:opacity-50"
          >Switch</button
        >
      {/if}
      <button class="hover:underline" onclick={() => (branches = null)}
        >Cancel</button
      >
    </div>
  {/if}

  {#if conflicts.length > 0}
    <GitHubConflicts
      {conflicts}
      onresolve={resolve}
      oncancel={() => {
        conflicts = [];
        switchingTo = null;
      }}
    />
  {/if}
</div>

<GitHubCommitDialog
  bind:show={showCommit}
  {repo}
  branch={summary?.branch ?? ""}
  {onchanged}
/>
