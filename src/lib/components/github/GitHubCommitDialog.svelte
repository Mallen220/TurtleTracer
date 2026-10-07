<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Commits the edits in a GitHub working copy back to GitHub. -->
<script lang="ts">
  import { tick } from "svelte";
  import { currentFilePath, isUnsaved, notification } from "../../../stores";
  import { saveProject } from "../../../utils/fileHandlers";
  import { branchNameProblem, GitHubError } from "../../../utils/github/api";
  import {
    githubPath,
    isGitHubPath,
    repoKey,
    type RepoRef,
  } from "../../../utils/github/paths";
  import {
    githubRepos,
    OTHER_TAB_MESSAGE,
    type CommitResult,
    type RepoChange,
    type Resolution,
    type UpdateResult,
  } from "../../../utils/github/repos";
  import { githubLogin, githubToken } from "../../../utils/github/token";
  import { CloseIcon, GithubIcon } from "../icons";
  import MessageText from "../MessageText.svelte";
  import PathText from "../PathText.svelte";
  import GitHubConflicts from "./GitHubConflicts.svelte";
  import GitHubTokenForm from "./GitHubTokenForm.svelte";

  interface Props {
    show?: boolean;
    repo: RepoRef;
    branch: string;
    /** Called after a commit or an update changed the working copy. */
    onchanged?: (update?: UpdateResult) => void;
  }

  let { show = $bindable(false), repo, branch, onchanged }: Props = $props();

  const editable = githubRepos.editable;
  const STATUS_LABEL = { added: "New", modified: "Edited", deleted: "Deleted" };

  let changes: RepoChange[] = $state([]);
  let message = $state("");
  let busy = $state(false);
  let error = $state("");
  let stale = $state(false);
  let conflicts: string[] = $state([]);
  let committed: CommitResult | null = $state(null);
  let target = $state<"branch" | "new">("branch");
  let newBranch = $state("");
  let confirmDeletes = $state(false);
  let messageInput: HTMLTextAreaElement | undefined = $state();

  let deletions = $derived(changes.filter((c) => c.status === "deleted"));
  let branchProblem = $derived(
    target === "new" ? branchNameProblem(newBranch) : null,
  );
  let canCommit = $derived(
    $editable &&
      !!$githubToken &&
      changes.length > 0 &&
      !!message.trim() &&
      !branchProblem &&
      (deletions.length === 0 || confirmDeletes),
  );

  /** The open project is in this repository and has unsaved edits. */
  let openFileUnsaved = $derived(
    $isUnsaved &&
      isGitHubPath($currentFilePath) &&
      $currentFilePath!.startsWith(githubPath(repo) + "/"),
  );

  $effect(() => {
    if (!show) return;
    committed = null;
    error = "";
    stale = false;
    conflicts = [];
    confirmDeletes = false;
    target = "branch";
    void load().then(() => {
      message = defaultMessage(changes);
      newBranch = defaultBranchName(changes);
      tick().then(() => messageInput?.select());
    });
  });

  async function load() {
    changes = await githubRepos.changes(repo);
  }

  const fileName = (c: RepoChange) => c.repoPath.split("/").pop()!;

  function defaultMessage(list: RepoChange[]): string {
    const names = list.map(fileName);
    if (names.length === 0) return "";
    const shown = names.slice(0, 3).join(", ");
    const more = names.length > 3 ? ` and ${names.length - 3} more` : "";
    return `Update ${shown}${more}`;
  }

  function defaultBranchName(list: RepoChange[]): string {
    const project = list.find((c) => /\.(turt|pp)$/i.test(c.repoPath));
    const name = (project ? fileName(project).replace(/\.\w+$/, "") : "paths")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "");
    const day = new Date().toISOString().slice(5, 10);
    return `paths/${name || "update"}-${day}`;
  }

  function close() {
    show = false;
  }

  async function saveOpenFile() {
    await saveProject({ quiet: true });
    await load();
    message ||= defaultMessage(changes);
  }

  async function commit() {
    if (!canCommit) return;
    busy = true;
    error = "";
    stale = false;
    try {
      const result = await githubRepos.commit(
        repo,
        message,
        target === "new" ? { newBranch } : {},
      );
      committed = result;
      changes = [];
      notification.set({
        message: `Committed to ${repoKey(repo)} on ${result.branch}`,
        type: "success",
        timeout: 4000,
      });
      onchanged?.();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      if (e instanceof GitHubError) {
        stale = e.kind === "stale";
        if (e.kind === "protected") target = "new";
      }
    } finally {
      busy = false;
    }
  }

  async function update(resolve?: Resolution) {
    busy = true;
    error = "";
    try {
      const result = await githubRepos.update(repo, resolve);
      if (result.status === "conflicts") {
        conflicts = result.conflicts;
        return;
      }
      conflicts = [];
      stale = false;
      await load();
      onchanged?.(result);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="github-commit-title"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === "Escape") close();
    }}
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-full max-w-lg p-6 border border-neutral-200 dark:border-neutral-700 flex flex-col gap-4 max-h-full overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <h2
          id="github-commit-title"
          class="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2"
        >
          <GithubIcon className="size-5" />
          Commit to GitHub
        </h2>
        <button
          onclick={close}
          class="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700"
          aria-label="Close"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      {#if committed}
        <div
          class="text-sm text-neutral-700 dark:text-neutral-300 flex flex-col gap-2"
        >
          <p>
            Committed to <strong>{committed.branch}</strong> in {repoKey(repo)}.
          </p>
          <p class="text-neutral-500 dark:text-neutral-400">
            Teammates get it when they pull. It reaches the robot after someone
            builds and deploys the code.
          </p>
          <div class="flex gap-4">
            {#if committed.pullRequestUrl}
              <a
                href={committed.pullRequestUrl}
                target="_blank"
                rel="noopener noreferrer"
                class="font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >Open a pull request</a
              >
            {/if}
            <a
              href={committed.url}
              target="_blank"
              rel="noopener noreferrer"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >View the commit</a
            >
          </div>
        </div>
        <button
          onclick={close}
          class="self-end px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
          >Done</button
        >
      {:else}
        {#if !$editable}
          <p
            class="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-xs text-amber-900 dark:text-amber-200"
          >
            {OTHER_TAB_MESSAGE}
          </p>
        {/if}
        {#if openFileUnsaved}
          <div
            class="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-3 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2"
          >
            The open file has unsaved edits, which won't be committed.
            <button
              class="shrink-0 px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium"
              onclick={saveOpenFile}>Save now</button
            >
          </div>
        {/if}

        {#if changes.length === 0}
          <p class="text-sm text-neutral-600 dark:text-neutral-400">
            Nothing has changed since the last commit.
          </p>
        {:else}
          <ul
            class="text-sm border border-neutral-200 dark:border-neutral-700 rounded-md divide-y divide-neutral-200 dark:divide-neutral-700 max-h-48 overflow-y-auto"
          >
            {#each changes as change (change.repoPath)}
              <li class="flex items-center gap-2 px-3 py-1.5">
                <span
                  class="shrink-0 w-14 text-xs font-medium"
                  class:text-green-600={change.status === "added"}
                  class:text-amber-600={change.status === "modified"}
                  class:text-red-600={change.status === "deleted"}
                  >{STATUS_LABEL[change.status]}</span
                >
                <span
                  class="font-mono text-xs min-w-0 [overflow-wrap:anywhere] text-neutral-800 dark:text-neutral-200"
                  ><PathText path={change.repoPath} /></span
                >
              </li>
            {/each}
          </ul>

          {#if deletions.length > 0}
            <label
              class="flex items-start gap-2 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-xs text-red-800 dark:text-red-200"
            >
              <input
                type="checkbox"
                bind:checked={confirmDeletes}
                class="mt-0.5"
              />
              <span>
                Delete {deletions.length === 1
                  ? "this file"
                  : `these ${deletions.length} files`} from GitHub for everyone on
                your team.
              </span>
            </label>
          {/if}

          <label
            class="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300"
          >
            Message
            <textarea
              bind:this={messageInput}
              bind:value={message}
              rows="2"
              onkeydown={(e) => e.stopPropagation()}
              class="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            ></textarea>
          </label>

          <fieldset
            class="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-300"
          >
            <legend class="sr-only">Where to commit</legend>
            <label class="flex items-center gap-2">
              <input type="radio" bind:group={target} value="branch" />
              Commit to <strong class="font-mono">{branch}</strong>
            </label>
            <label class="flex items-center gap-2">
              <input type="radio" bind:group={target} value="new" />
              Commit to a new branch and open a pull request, so the team can review
              it first
            </label>
            {#if target === "new"}
              <input
                bind:value={newBranch}
                aria-label="New branch name"
                spellcheck="false"
                onkeydown={(e) => e.stopPropagation()}
                class="ml-6 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {#if branchProblem}
                <p class="ml-6 text-xs text-red-600 dark:text-red-400">
                  {branchProblem}
                </p>
              {/if}
            {/if}
          </fieldset>

          {#if !$githubToken}
            <GitHubTokenForm {repo} />
          {/if}
        {/if}

        {#if error}
          <p
            class="text-sm text-red-600 dark:text-red-400 [overflow-wrap:anywhere]"
            role="alert"
          >
            <MessageText message={error} />
          </p>
        {/if}
        {#if conflicts.length > 0}
          <GitHubConflicts
            {conflicts}
            onresolve={(resolution) => update(resolution)}
            oncancel={() => (conflicts = [])}
          />
        {/if}

        <div class="flex items-center justify-end gap-2">
          {#if $githubToken && $githubLogin && changes.length > 0}
            <span class="mr-auto text-xs text-neutral-500 dark:text-neutral-400"
              >as @{$githubLogin}</span
            >
          {/if}
          {#if stale}
            <button
              onclick={() => update()}
              disabled={busy}
              class="px-4 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 text-sm font-medium text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 disabled:opacity-50"
              >Update from GitHub</button
            >
          {/if}
          <button
            onclick={commit}
            disabled={busy || !canCommit}
            class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Working…" : "Commit"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
