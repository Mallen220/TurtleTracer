<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Opens a GitHub repository from a pasted link. -->
<script lang="ts">
  import { tick } from "svelte";
  import { GitHubError } from "../../../utils/github/api";
  import { parseGitHubLink } from "../../../utils/github/links";
  import { githubPath, repoKey } from "../../../utils/github/paths";
  import {
    githubRepos,
    type LinkTarget,
    type OpenedRepo,
  } from "../../../utils/github/repos";
  import { CloseIcon, GithubIcon } from "../icons";
  import MessageText from "../MessageText.svelte";
  import PathText from "../PathText.svelte";
  import GitHubTokenForm from "./GitHubTokenForm.svelte";

  interface Props {
    show?: boolean;
    onopened: (opened: OpenedRepo) => void;
  }

  let { show = $bindable(false), onopened }: Props = $props();

  const summaries = githubRepos.summaries;

  let link = $state("");
  let target: LinkTarget | null = $state(null);
  let branch = $state("");
  let busy = $state(false);
  let error = $state("");
  let showToken = $state(false);
  let linkInput: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (!show) return;
    void githubRepos.ready();
    tick().then(() => linkInput?.focus());
  });

  function reset() {
    target = null;
    error = "";
  }

  function close() {
    show = false;
    link = "";
    reset();
  }

  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
    if (e instanceof GitHubError && e.kind === "rate-limit") showToken = true;
  }

  async function find() {
    reset();
    const parsed = parseGitHubLink(link);
    if (!parsed) {
      error =
        "That doesn't look like a GitHub repository link. Paste the address of the repository's page, like https://github.com/your-team/your-robot-code.";
      return;
    }
    busy = true;
    try {
      target = await githubRepos.lookUp(parsed);
      branch = target.branch;
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function open() {
    if (!target) return;
    busy = true;
    error = "";
    try {
      const record = await githubRepos.open(target, branch);
      // The link's folder or file only applies on the branch it named.
      const linkPath = branch === target.branch ? target.path : "";
      onopened({
        record,
        folder: githubRepos.startFolder(record, linkPath),
        file:
          target.kind === "file" && linkPath
            ? githubPath(record, linkPath)
            : undefined,
      });
      close();
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function reopen(owner: string, repo: string) {
    const record = await githubRepos.get({ owner, repo });
    if (!record) return;
    onopened({ record, folder: githubRepos.startFolder(record) });
    close();
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="github-open-title"
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
          id="github-open-title"
          class="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2"
        >
          <GithubIcon className="size-5" />
          Open from GitHub
        </h2>
        <button
          onclick={close}
          class="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700"
          aria-label="Close"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <p class="text-sm text-neutral-600 dark:text-neutral-400">
        Paste a link to your team's repository, or to a folder or file in it.
        You can edit its paths here and commit them back. Only public
        repositories are supported for now.
      </p>

      <div class="flex gap-2">
        <input
          bind:this={linkInput}
          bind:value={link}
          oninput={reset}
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") (target ? open : find)();
          }}
          placeholder="https://github.com/your-team/your-robot-code"
          aria-label="GitHub link"
          spellcheck="false"
          class="flex-1 min-w-0 px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        {#if !target}
          <button
            onclick={find}
            disabled={busy || !link.trim()}
            class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Looking…" : "Find"}
          </button>
        {/if}
      </div>

      {#if target}
        <div
          class="rounded-md border border-neutral-200 dark:border-neutral-700 p-3 flex flex-col gap-3"
        >
          <div class="text-sm font-semibold text-neutral-900 dark:text-white">
            {repoKey(target)}
            {#if target.path}
              <span
                class="block text-xs font-normal text-neutral-500 dark:text-neutral-400 font-mono [overflow-wrap:anywhere]"
                ><PathText path={target.path} /></span
              >
            {/if}
          </div>
          <label
            class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300"
          >
            Branch
            <select
              bind:value={branch}
              class="flex-1 px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900"
            >
              {#each target.branches as name (name)}
                <option value={name}
                  >{name}{name === target.defaultBranch
                    ? " (default)"
                    : ""}</option
                >
              {/each}
            </select>
          </label>
          <button
            onclick={open}
            disabled={busy}
            class="self-end px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Opening…" : "Open"}
          </button>
        </div>
      {/if}

      {#if error}
        <p
          class="text-sm text-red-600 dark:text-red-400 [overflow-wrap:anywhere]"
          role="alert"
        >
          <MessageText message={error} />
        </p>
      {/if}

      {#if $summaries.length > 0}
        <div class="flex flex-col gap-1">
          <h3
            class="text-xs font-semibold uppercase tracking-wider text-neutral-500"
          >
            Opened before
          </h3>
          {#each $summaries as repo (repoKey(repo))}
            <button
              onclick={() => reopen(repo.owner, repo.repo)}
              class="flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200"
            >
              <span class="truncate">{repoKey(repo)}</span>
              <span class="shrink-0 text-xs text-neutral-500">
                {repo.branch}{repo.changeCount
                  ? ` · ${repo.changeCount} not committed`
                  : ""}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      <div class="border-t border-neutral-200 dark:border-neutral-700 pt-3">
        <button
          class="text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
          aria-expanded={showToken}
          onclick={() => (showToken = !showToken)}
        >
          {showToken ? "▾" : "▸"} GitHub token
        </button>
        {#if showToken}
          <div class="mt-2">
            <GitHubTokenForm />
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
