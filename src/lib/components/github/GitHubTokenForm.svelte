<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Adding, checking and removing the GitHub token used to commit. -->
<script lang="ts">
  import { createGitHubClient } from "../../../utils/github/api";
  import { repoKey, type RepoRef } from "../../../utils/github/paths";
  import {
    clearGitHubToken,
    githubLogin,
    githubToken,
    isGitHubTokenRemembered,
    REMEMBER_DAYS,
    setGitHubToken,
  } from "../../../utils/github/token";

  interface Props {
    /** The repository the token is for, to tailor the steps and check access. */
    repo?: RepoRef | null;
    /** Called once a token has been checked with GitHub and kept. */
    onsaved?: (login: string) => void;
  }

  let { repo = null, onsaved }: Props = $props();

  const NEW_TOKEN_URL =
    "https://github.com/settings/personal-access-tokens/new";
  const isDesktop = !!(
    globalThis as { electronAPI?: { githubToken?: unknown } }
  ).electronAPI?.githubToken;

  let input = $state("");
  let remember = $state(false);
  let checking = $state(false);
  let error = $state("");
  let warning = $state("");
  let replacing = $state(false);
  let showSteps = $state(true);

  async function save() {
    const token = input.trim();
    if (!token) return;
    checking = true;
    error = "";
    warning = "";
    try {
      const client = createGitHubClient(() => token);
      const login = await client.getViewer();
      if (repo && !(await client.canPush(repo.owner, repo.repo))) {
        warning = `@${login} can't push to ${repoKey(repo)}, so commits will fail. Ask an owner of the repository to give you write access.`;
      }
      await setGitHubToken(token, remember, login);
      input = "";
      replacing = false;
      onsaved?.(login);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      checking = false;
    }
  }
</script>

<div class="flex flex-col gap-2 text-sm">
  {#if $githubToken && !replacing}
    <div class="flex items-center justify-between gap-2">
      <span class="text-neutral-700 dark:text-neutral-200">
        {$githubLogin
          ? `Commits are made as @${$githubLogin}.`
          : "A GitHub token is added."}
        <span class="text-neutral-500 dark:text-neutral-400">
          {isGitHubTokenRemembered()
            ? `Remembered on this device for up to ${REMEMBER_DAYS} days.`
            : "Kept until you close Turtle Tracer."}
        </span>
      </span>
      <span class="flex gap-2 shrink-0">
        <button
          class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          onclick={() => (replacing = true)}>Replace</button
        >
        <button
          class="text-xs text-red-600 dark:text-red-400 hover:underline"
          onclick={() => clearGitHubToken()}>Forget</button
        >
      </span>
    </div>
    {#if warning}
      <p class="text-xs text-amber-700 dark:text-amber-300" role="status">
        {warning}
      </p>
    {/if}
  {:else}
    <p class="text-neutral-600 dark:text-neutral-400">
      Committing needs a GitHub <strong>personal access token</strong>: a
      password-like key that lets Turtle Tracer commit as you, only to the
      repository you choose.
    </p>
    <button
      class="self-start text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
      aria-expanded={showSteps}
      onclick={() => (showSteps = !showSteps)}
    >
      {showSteps ? "Hide" : "Show"} how to make one
    </button>
    {#if showSteps}
      <ol
        class="list-decimal pl-5 text-xs text-neutral-600 dark:text-neutral-400 flex flex-col gap-1"
      >
        <li>
          Open
          <a
            href={NEW_TOKEN_URL}
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-600 dark:text-blue-400 hover:underline"
            >GitHub's new fine-grained token page</a
          > (sign in as yourself).
        </li>
        <li>
          Name it "Turtle Tracer" and set <strong>Expiration</strong> to the end of
          your season.
        </li>
        <li>
          Set <strong>Resource owner</strong> to
          <strong>{repo?.owner ?? "the owner of your team's repository"}</strong
          >{repo ? "" : " (the first part of its link)"}. If it isn't listed,
          your organization doesn't allow these tokens yet: ask a mentor.
        </li>
        <li>
          Under <strong>Repository access</strong>, choose
          <strong>Only select repositories</strong> and pick
          <strong>{repo?.repo ?? "your team's repository"}</strong>.
        </li>
        <li>
          Under <strong>Permissions</strong>, set
          <strong>Contents</strong> to <strong>Read and write</strong>. Nothing
          else is needed.
        </li>
        <li>
          Click <strong>Generate token</strong> and paste it below. If your organization
          approves tokens, an owner has to approve it before commits work.
        </li>
      </ol>
    {/if}
    <div class="flex gap-2">
      <input
        type="password"
        bind:value={input}
        placeholder="github_pat_…"
        autocomplete="off"
        spellcheck="false"
        aria-label="GitHub token"
        onkeydown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") save();
        }}
        class="flex-1 min-w-0 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        onclick={save}
        disabled={checking || !input.trim()}
        class="px-3 py-1.5 rounded-md bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs font-medium disabled:opacity-50"
      >
        {checking ? "Checking…" : "Add token"}
      </button>
    </div>
    <label
      class="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400"
    >
      <input type="checkbox" bind:checked={remember} class="mt-0.5" />
      <span>
        Remember on this device for {REMEMBER_DAYS} days{isDesktop
          ? ", locked with this computer's keychain"
          : ""}. Don't use this on a shared computer: anyone using it could
        commit as you.
      </span>
    </label>
    {#if error}
      <p class="text-xs text-red-600 dark:text-red-400" role="alert">
        {error}
      </p>
    {/if}
  {/if}
</div>
