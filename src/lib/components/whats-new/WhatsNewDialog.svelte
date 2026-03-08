<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import MarkdownIt from "markdown-it";
  import {
    features,
    getAllFeatures,
    getLatestHighlightId,
    type FeatureHighlight,
  } from "./features";
  import { pages, type Page } from "./pages";
  import { highlightText, highlightSnippet, getSnippet } from "./searchUtils";
  // @ts-ignore
  import changelogContent from "../../../../CHANGELOG.md?raw";
  // Import app version from package.json so the UI shows the real version at build time
  // @ts-ignore
  import pkg from "../../../../package.json";
  import { onMount, tick } from "svelte";
  // @ts-ignore
  import { saveAutoPathsDirectory } from "../../../utils/directorySettings";

  export let show = false;
  export let setupMode = false;

  const dispatch = createEventDispatcher();
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  // Navigation state
  let activeTab: "home" | "changelog" = "home";
  let currentView: "grid" | "content" | "release-list" | "setup" = "grid";
  let previousView: "grid" | "release-list" = "grid";
  let activePage: Page | null = null;
  let activeFeatureId: string | null = null;
  let searchQuery = "";
  let contentContainer: HTMLDivElement;

  // Log features at component init so we can see what the dialog receives at runtime
  // eslint-disable-next-line no-console
  console.info(
    "[whats-new] dialog sees features:",
    features.length,
    features.map((f) => f.id),
  );

  // Runtime-loaded features (dynamic fallback when compile-time glob yields nothing)
  let runtimeFeatures: FeatureHighlight[] = [];

  // Decide which features list to render: prefer compile-time `features`, otherwise
  // use runtime-discovered ones. Use getAllFeatures() to include newest.md if it's not a template.
  $: displayedFeatures = features.length ? getAllFeatures() : runtimeFeatures;

  // If the static import produced no features (e.g., in the renderer during
  // Electron runtime), attempt to dynamically import them at runtime.
  onMount(async () => {
    if (
      features.length === 0 &&
      typeof (import.meta as any).glob === "function"
    ) {
      try {
        // Use a non-eager glob to get importer functions and fetch content at runtime.
        // Prefer the query/import form so the import returns raw content as default.
        let dynamic: Record<string, (args?: any) => Promise<any>> | undefined;
        try {
          // @ts-ignore
          dynamic = (import.meta as any).glob("./features/*.md", {
            query: "?raw",
            import: "default",
          }) as Record<string, (args?: any) => Promise<any>>;
        } catch (e) {
          try {
            dynamic = (import.meta as any).glob(
              "./features/*.md?raw",
            ) as Record<string, (args?: any) => Promise<any>>;
          } catch (e) {
            dynamic = undefined;
          }
        }
        const entries = Object.entries(dynamic || {});
        const out: FeatureHighlight[] = [];
        for (const [path, importer] of entries) {
          try {
            const res = await importer();
            const content =
              typeof res === "string" ? res : (res?.default ?? "");
            const fileName = path.split("/").pop()!;
            const fileBase = fileName.replace(/\?.*$/, "");
            const id = fileBase.replace(/\.md$/, "");
            out.push({
              id,
              title: `Version ${id.replace(/^v/, "")} Highlights`,
              content,
            });
          } catch (e) {
            // ignore individual failures
          }
        }
        // Sort newest first
        out.sort((a, b) => {
          const pa = a.id
            .replace(/^v/, "")
            .split(".")
            .map((n) => parseInt(n, 10) || 0);
          const pb = b.id
            .replace(/^v/, "")
            .split(".")
            .map((n) => parseInt(n, 10) || 0);
          for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            if ((pb[i] || 0) !== (pa[i] || 0))
              return (pb[i] || 0) - (pa[i] || 0);
          }
          return 0;
        });
        runtimeFeatures = out;
        // eslint-disable-next-line no-console
        console.info(
          "[whats-new] runtime loaded features:",
          runtimeFeatures.map((f) => f.id),
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[whats-new] runtime feature import failed", e);
      }

      // If import.meta.glob is provided as a plain object (built bundle form),
      // try to extract raw content from that object now that the function-based
      // runtime attempt failed or wasn't executed.
      try {
        const globAny = (import.meta as any).glob;
        if (features.length === 0 && globAny && typeof globAny === "object") {
          const entries = Object.entries(globAny as Record<string, any>);
          const out2: FeatureHighlight[] = [];
          for (const [path, val] of entries) {
            try {
              const content =
                typeof val === "string" ? val : (val?.default ?? "");
              const fileName = path.split("/").pop()!;
              const fileBase = fileName.replace(/\?.*$/, "");
              const id = fileBase.replace(/\.md$/, "");
              out2.push({
                id,
                title: `Version ${id.replace(/^v/, "")} Highlights`,
                content,
              });
            } catch (ee) {}
          }
          out2.sort((a, b) => {
            const pa = a.id
              .replace(/^v/, "")
              .split(".")
              .map((n) => parseInt(n, 10) || 0);
            const pb = b.id
              .replace(/^v/, "")
              .split(".")
              .map((n) => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
              if ((pb[i] || 0) !== (pa[i] || 0))
                return (pb[i] || 0) - (pa[i] || 0);
            }
            return 0;
          });
          runtimeFeatures = out2;
          // eslint-disable-next-line no-console
          console.info(
            "[whats-new] runtime loaded features (object):",
            runtimeFeatures.map((f) => f.id),
          );
        }
      } catch (e) {
        // ignore
      }
    }
  });

  $: if (show && setupMode) {
    currentView = "setup";
  }

  $: searchResults = (() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();

    // Search pages
    const matchedPages = pages
      .map((p) => {
        if (p.type === "changelog") return null;

        const inTitle = p.title.toLowerCase().includes(query);
        const inDesc = p.description.toLowerCase().includes(query);
        const snippet = p.content ? getSnippet(p.content, query) : null;

        if (inTitle || inDesc || snippet) {
          return { type: "page" as const, item: p, snippet };
        }
        return null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // Search features
    const matchedFeatures = displayedFeatures
      .map((f) => {
        const inTitle = f.title.toLowerCase().includes(query);
        const snippet = getSnippet(f.content, query);

        if (inTitle || snippet) {
          return { type: "feature" as const, item: f, snippet };
        }
        return null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return [...matchedPages, ...matchedFeatures];
  })();

  async function highlightAndScroll() {
    await tick();

    if (!contentContainer || !searchQuery) return;

    highlightText(contentContainer, searchQuery);

    const firstMark = contentContainer.querySelector("mark");
    if (firstMark) {
      firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function close() {
    show = false;
    dispatch("close");
  }

  async function selectDirectory() {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI && electronAPI.setDirectory) {
      try {
        const selected = await electronAPI.setDirectory();
        if (selected) {
          // Directory selected successfully
          await saveAutoPathsDirectory(selected);

          // Close setup
          setupMode = false;
          dispatch("setupComplete");
          close();
        }
      } catch (err) {
        console.error("Failed to select directory", err);
      }
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && show) {
      if (setupMode) return; // Prevent closing setup with Escape

      if (searchQuery) {
        searchQuery = "";
        return;
      }
      if (currentView === "content" && activeTab === "home") {
        goBack();
      } else if (currentView === "release-list") {
        goBack();
      } else {
        close();
      }
    }
  }

  function handlePageClick(page: Page) {
    if (page.type === "changelog") {
      activeTab = "changelog";
      return;
    }

    if (page.type === "release-list") {
      currentView = "release-list";
      return;
    }

    if (page.type === "highlight") {
      // If the page doesn't declare a highlightId (e.g. "Recent Highlights"),
      // use getLatestHighlightId() which returns "newest" if it's not a template,
      // or falls back to the most recent version.
      const targetId = page.highlightId ?? getLatestHighlightId();
      if (targetId) {
        activeFeatureId = targetId;
        activePage = page;
        previousView = "grid";
        currentView = "content";
      } else {
        // No features available — show an informative placeholder instead of
        // doing nothing. This keeps the UI from appearing broken.
        console.warn(
          "[whats-new] no features available to show for page",
          page.id,
        );
        // Keep on the grid; we could also open the changelog instead.
      }
      return;
    }

    if (page.type === "page") {
      activePage = page;
      previousView = "grid";
      currentView = "content";
    }
  }

  function handleFeatureClick(feature: FeatureHighlight) {
    activeFeatureId = feature.id;
    activePage = null;
    // If we are in the release list view, record that so we can go back
    if (currentView === "release-list") {
      previousView = "release-list";
    } else {
      previousView = "grid";
    }
    currentView = "content";
  }

  function handleSearchResultClick(result: {
    type: "page" | "feature";
    item: any;
  }) {
    if (result.type === "page") {
      handlePageClick(result.item);
    } else {
      handleFeatureClick(result.item);
    }
    // Note: searchQuery remains active, so 'back' will effectively return to search results
  }

  function goBack() {
    if (setupMode) {
      currentView = "setup";
      activePage = null;
      activeFeatureId = null;
      return;
    }

    // If searching, we just clear the content view (if any) but keep search query active
    // This effectively returns to the search results list
    if (searchQuery && currentView === "content") {
      currentView = "grid"; // 'grid' + searchQuery = search results view
      activePage = null;
      activeFeatureId = null;
      return;
    }

    if (currentView === "content" && previousView === "release-list") {
      currentView = "release-list";
      activePage = null;
      activeFeatureId = null;
      return;
    }

    // Default back behavior
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
    searchQuery = ""; // Clear search when going back to home grid
  }

  function switchToHome() {
    activeTab = "home";
    currentView = "grid";
    activePage = null;
    activeFeatureId = null;
    searchQuery = "";
  }

  // Render markdown content
  // We only render the active content now
  $: activeContentHtml = (() => {
    if (activeTab === "changelog") {
      return md.render(changelogContent);
    }

    if (activeFeatureId) {
      const feature = displayedFeatures.find((f) => f.id === activeFeatureId);
      return feature ? md.render(feature.content) : "";
    }

    if (activePage && activePage.content) {
      return md.render(activePage.content);
    }

    return "";
  })();

  // Trigger highlighting and scrolling when content matches search
  $: if (activeContentHtml && currentView === "content" && searchQuery) {
    highlightAndScroll();
  }

  // Icons
  const icons: Record<string, string> = {
    sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
    rocket: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
    keyboard: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" ry="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M6 12h.001"/><path d="M10 12h.001"/><path d="M14 12h.001"/><path d="M18 12h.001"/><path d="M7 16h10"/></svg>`,
    "file-text": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><line x1="10" x2="8" y1="9" y2="9"/></svg>`,
    folder: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>`,
    pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>`,
    cube: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-9 5-9-5"/><polygon points="12 3 21 8 12 13 3 8 12 3"/></svg>`,
    "map-pin": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
    "chart-bar": `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`,
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    cog: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  };

  // Application version read from package.json (set at build time)
  const appVersion: string = (pkg as any)?.version ?? "?.?.?";

  $: title = searchQuery
    ? "Search Results"
    : activeTab === "changelog"
      ? "Full Changelog"
      : currentView === "setup"
        ? "Welcome!"
        : currentView === "content" && activePage
          ? activePage.title
          : currentView === "content" && activeFeatureId
            ? (displayedFeatures.find((f) => f.id === activeFeatureId)?.title ??
              "Feature Highlight")
            : currentView === "release-list"
              ? "Release Notes"
              : "What's New / Docs";

  // Header extraction for TOC
  let headers: { id: string; text: string; level: number }[] = [];

  async function updateHeaders() {
    await tick();
    if (!contentContainer) return;
    const headings = contentContainer.querySelectorAll("h1, h2, h3");
    headers = Array.from(headings).map((h, i) => {
      if (!h.id) {
        // Generate a stable-ish ID based on text content if possible, or fallback to index
        const textSlug = (h.textContent || "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");
        h.id = textSlug || `header-${i}`;
      }
      return {
        id: h.id,
        text: h.textContent || "Header",
        level: parseInt(h.tagName.substring(1)),
      };
    });
  }

  function scrollToHeader(id: string) {
    const el = contentContainer?.querySelector(`#${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  }

  // Handle links in markdown content
  function handleContentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href) return;

    // Handle internal markdown links
    if (href.endsWith(".md") || href.includes(".md#")) {
      e.preventDefault();
      const [path, hash] = href.split("#");
      const filename = path.split("/").pop()?.replace(/\.md$/, "");

      if (filename) {
        // Try to find page or feature
        const foundPage = pages.find((p) => p.id === filename);
        if (foundPage) {
          handlePageClick(foundPage);
        } else {
          const foundFeature = displayedFeatures.find((f) => f.id === filename);
          if (foundFeature) {
            handleFeatureClick(foundFeature);
          }
        }

        // If there's a hash, scroll to it after update
        if (hash) {
          tick().then(() => {
            scrollToHeader(hash);
          });
        }
      }
    } else if (href.startsWith("#")) {
      // Internal hash link
      e.preventDefault();
      scrollToHeader(href.substring(1));
    } else if (href.startsWith("http")) {
      // External link - allow default (will open in new window if target=_blank)
      // or we can force it here for electron
      anchor.target = "_blank";
    }
  }

  // Update headers when content changes
  $: if (activeContentHtml && currentView === "content") {
    updateHeaders();
  }

  // Show/hide table of contents (On this page). Persist preference to localStorage.
  let showToc = true;
  onMount(() => {
    try {
      const v = localStorage.getItem("whatsnew.showToc");
      if (v !== null) showToc = v === "1";
    } catch (e) {
      /* ignore */
    }
  });

  function toggleToc() {
    showToc = !showToc;
    try {
      localStorage.setItem("whatsnew.showToc", showToc ? "1" : "0");
    } catch (e) {
      /* ignore */
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4"
    role="dialog"
    aria-modal="true"
    aria-labelledby="whats-new-title"
  >
    <div
      class="bg-white dark:bg-neutral-800 md:rounded-xl shadow-2xl w-full h-full md:h-auto md:w-full md:max-w-4xl md:max-h-[85vh] flex flex-col overflow-hidden border-0 md:border border-neutral-200 dark:border-neutral-700 transition-all duration-200"
    >
      <!-- Header -->
      <div
        class="flex-none p-4 md:p-6 border-b border-neutral-200 dark:border-neutral-700 flex flex-col md:flex-row justify-between items-start md:items-center bg-neutral-50 dark:bg-neutral-800 gap-4"
      >
        <div class="flex items-center gap-4 w-full md:w-auto">
          {#if (!setupMode || currentView === "content") && (activeTab === "changelog" || (activeTab === "home" && currentView !== "grid" && !searchQuery) || (searchQuery && currentView === "content"))}
            <button
              class="p-2 rounded-full hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              on:click={() =>
                activeTab === "changelog" ? switchToHome() : goBack()}
              aria-label="Back"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
            </button>
          {/if}
          <div class="flex-1">
            <h1
              id="whats-new-title"
              class="text-xl md:text-2xl font-bold text-neutral-900 dark:text-white flex items-center gap-2 whitespace-nowrap"
            >
              {#if activeTab === "home" && currentView === "grid" && !searchQuery}
                <span>🎉</span>
              {/if}
              {title}
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-3 w-full md:w-auto">
          {#if activeTab === "home" && !setupMode}
            <div class="relative w-full md:w-64">
              <input
                type="text"
                placeholder="Search..."
                bind:value={searchQuery}
                class="w-full px-4 py-2 rounded-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
              {#if searchQuery}
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                  on:click={() => (searchQuery = "")}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><line x1="18" y1="6" x2="6" y2="18" /><line
                      x1="6"
                      y1="6"
                      x2="18"
                      y2="18"
                    /></svg
                  >
                </button>
              {:else}
                <div
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><circle cx="11" cy="11" r="8" /><line
                      x1="21"
                      y1="21"
                      x2="16.65"
                      y2="16.65"
                    /></svg
                  >
                </div>
              {/if}
            </div>
          {/if}

          {#if !setupMode}
            <button
              class="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors md:ml-1"
              on:click={close}
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/if}

          {#if !setupMode}
            <!-- Mobile Close Button (Absolute position top right) -->
            <button
              class="md:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              on:click={close}
              aria-label="Close"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          {/if}
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col min-h-0 bg-white dark:bg-neutral-900">
        {#if searchQuery && currentView !== "content"}
          <!-- Search Results View -->
          <div
            class="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto animate-fade-in w-full"
          >
            {#if searchResults.length === 0}
              <div
                class="flex flex-col items-center justify-center text-center py-12 text-neutral-500"
              >
                <div class="mb-4 text-6xl">🔍</div>
                <h3 class="text-xl font-bold mb-2">No results found</h3>
                <p>Try searching for something else.</p>
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-2">
                {#each searchResults as result}
                  <button
                    class="flex items-start gap-4 p-4 rounded-lg border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-all text-left group"
                    on:click={() => handleSearchResultClick(result)}
                  >
                    <div
                      class="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 shrink-0"
                    >
                      {#if result.type === "page"}
                        {@html icons[result.item.icon] || icons["sparkles"]}
                      {:else}
                        {@html icons["sparkles"]}
                      {/if}
                    </div>
                    <div>
                      <h3
                        class="font-bold text-neutral-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
                      >
                        {result.item.title}
                      </h3>
                      <p
                        class="text-sm text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-2"
                      >
                        {#if result.snippet}
                          {@html highlightSnippet(result.snippet, searchQuery)}
                        {:else}
                          {result.type === "page"
                            ? result.item.description
                            : "Feature Highlight"}
                        {/if}
                      </p>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === "home" && currentView === "grid"}
          <!-- Grid View -->
          <div
            class="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto animate-fade-in w-full"
          >
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {#each pages as page}
                <button
                  class="group flex flex-col items-start p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-500 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 shadow-sm hover:shadow-md text-left w-full h-full"
                  on:click={() => handlePageClick(page)}
                >
                  <div
                    class="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform duration-200"
                  >
                    {@html icons[page.icon] || icons["sparkles"]}
                  </div>
                  <h3
                    class="text-lg font-bold text-neutral-900 dark:text-white mb-2 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors"
                  >
                    {page.title}
                  </h3>
                  <p
                    class="text-neutral-500 dark:text-neutral-400 text-sm leading-relaxed"
                  >
                    {page.description}
                  </p>
                </button>
              {/each}
            </div>

            <!-- Version info footer -->
            <div
              class="mt-12 text-center text-sm text-neutral-400 dark:text-neutral-600"
            >
              Pedro Pathing Plus Visualizer v{appVersion}
            </div>
          </div>
        {:else if activeTab === "home" && currentView === "release-list"}
          <!-- Release List View -->
          <div
            class="flex-1 overflow-y-auto p-4 md:p-8 max-w-3xl mx-auto animate-fade-in w-full"
          >
            <div class="space-y-4">
              {#if displayedFeatures.length === 0}
                <div
                  class="text-center text-neutral-500 dark:text-neutral-400 py-12"
                >
                  <div class="mb-2 text-xl font-semibold">
                    No release highlights
                  </div>
                  <div class="text-sm">
                    There are no feature highlights available right now. You can
                    view the <button
                      class="text-purple-600 hover:underline"
                      on:click={() => (activeTab = "changelog")}
                      >Full Changelog</button
                    > instead.
                  </div>
                </div>
              {:else}
                {#each displayedFeatures as feature}
                  <button
                    class="w-full flex flex-col items-start p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-purple-500 dark:hover:border-purple-500 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-white dark:hover:bg-neutral-800 transition-all duration-200 shadow-sm hover:shadow-md text-left"
                    on:click={() => handleFeatureClick(feature)}
                  >
                    <div class="flex items-center gap-3 mb-2">
                      <div
                        class="p-1.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                      >
                        {@html icons["sparkles"]}
                      </div>
                      <h3
                        class="text-lg font-bold text-neutral-900 dark:text-white"
                      >
                        {feature.title}
                      </h3>
                    </div>
                    <p class="text-neutral-500 dark:text-neutral-400 text-sm">
                      Click to view highlights for this version.
                    </p>
                  </button>
                {/each}
              {/if}
            </div>
          </div>
        {:else if activeTab === "home" && currentView === "setup"}
          <!-- Setup View -->
          <div
            class="flex-1 overflow-y-auto p-8 max-w-2xl mx-auto animate-fade-in w-full flex flex-col items-center justify-center text-center"
          >
            <div
              class="w-24 h-24 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 mb-8"
            >
              {@html icons["folder"]}
            </div>

            <h2
              class="text-2xl font-bold text-neutral-900 dark:text-white mb-4"
            >
              Select Your AutoPaths Directory
            </h2>

            <p
              class="text-neutral-600 dark:text-neutral-300 mb-8 text-lg leading-relaxed"
            >
              Before we get started, please select where your paths should be
              stored.
              <br /><br />
              For most FTC projects, the best place is:<br />
              <code
                class="bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded text-purple-700 dark:text-purple-300 font-mono text-sm"
                >TeamCode/src/main/assets/AutoPaths/</code
              >
            </p>

            <div
              class="bg-purple-100 dark:bg-purple-900/20 p-4 rounded-xl mb-8 w-full max-w-lg text-left border border-purple-200 dark:border-purple-800"
            >
              <h3
                class="text-lg font-bold text-neutral-900 dark:text-white mb-2 flex items-center gap-2"
              >
                {@html icons["sparkles"]}
                Install PedroPathingPlus
              </h3>
              <p class="text-neutral-600 dark:text-neutral-300 text-sm mb-3">
                Install <strong>PedroPathingPlus</strong> to run
                <code>.pp</code> files directly and enable advanced commands.
              </p>
              <button
                class="text-purple-600 dark:text-purple-400 font-bold hover:underline text-sm flex items-center gap-1"
                on:click={() => {
                  const ppPage = pages.find(
                    (p) => p.id === "pedro-pathing-plus",
                  );
                  if (ppPage) handlePageClick(ppPage);
                }}
              >
                Learn More
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 8l4 4m0 0l-4 4m4-4H3"
                  />
                </svg>
              </button>
            </div>

            <button
              class="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-all duration-200 flex items-center gap-3 text-lg"
              on:click={selectDirectory}
            >
              {@html icons["folder"]}
              Select Directory...
            </button>
          </div>
        {:else}
          <!-- Content View -->
          <div class="flex-1 flex min-h-0">
            <!-- Main Text Area -->
            <div
              class="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in custom-scrollbar"
            >
              <div class="max-w-3xl mx-auto">
                <div
                  class="prose dark:prose-invert max-w-none"
                  bind:this={contentContainer}
                  on:click={handleContentClick}
                  role="presentation"
                >
                  {@html activeContentHtml}
                </div>

                {#if activeTab === "home" && currentView === "content"}
                  <div
                    class="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-700 flex justify-center"
                  >
                    <button
                      class="px-6 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors text-sm font-medium"
                      on:click={goBack}
                    >
                      Back
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <!-- Sidebar (TOC) -->
            {#if headers.length > 0 && !showToc}
              <!-- Collapsed TOC - Expand button -->
              <div
                class="hidden md:block w-12 border-l border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 shrink-0"
              >
                <div class="sticky top-4 flex justify-center pt-4">
                  <button
                    class="p-2 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all"
                    on:click={toggleToc}
                    aria-label="Expand table of contents"
                    title="Show table of contents"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="h-5 w-5"
                    >
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <line x1="3" y1="12" x2="21" y2="12"></line>
                      <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
            {:else if headers.length > 0 && showToc}
              <div
                class="hidden md:block w-64 border-l border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50 overflow-y-auto p-4 shrink-0 custom-scrollbar"
              >
                <div class="flex items-center justify-between mb-4">
                  <h4
                    class="font-bold text-sm text-neutral-500 dark:text-neutral-400 uppercase tracking-wider"
                  >
                    On this page
                  </h4>
                  <button
                    class="p-1.5 rounded-md hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-all"
                    on:click={toggleToc}
                    aria-label="Collapse table of contents"
                    title="Collapse table of contents"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      class="h-4 w-4"
                    >
                      <polyline points="18 15 12 9 6 15"></polyline>
                    </svg>
                  </button>
                </div>
                <ul class="space-y-2 text-sm">
                  {#each headers as header}
                    <li style="padding-left: {(header.level - 1) * 0.5}rem">
                      <a
                        href="#{header.id}"
                        data-internal="true"
                        on:click|preventDefault={() =>
                          scrollToHeader(header.id)}
                        class="block text-neutral-600 dark:text-neutral-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors truncate"
                      >
                        {header.text}
                      </a>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  /* Global styles for rendered markdown */
  :global(.prose h1) {
    @apply text-2xl font-bold mb-4 mt-8 first:mt-0;
  }
  :global(.prose h2) {
    @apply text-xl font-bold mb-3 mt-6;
  }
  :global(.prose h3) {
    @apply text-lg font-bold mb-2 mt-4;
  }
  :global(.prose p) {
    @apply mb-4 leading-relaxed;
  }
  :global(.prose ul) {
    @apply list-disc list-outside ml-5 mb-4;
  }
  :global(.prose ol) {
    @apply list-decimal list-outside ml-5 mb-4;
  }
  :global(.prose li) {
    @apply mb-1;
  }
  :global(.prose strong) {
    @apply font-bold text-neutral-900 dark:text-neutral-100;
  }
  :global(.prose a) {
    @apply text-purple-600 dark:text-purple-400 hover:underline;
  }
  :global(.prose code) {
    @apply bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-sm font-mono text-purple-700 dark:text-purple-300;
  }
  :global(.prose pre) {
    @apply bg-neutral-100 dark:bg-neutral-800 p-4 rounded-lg overflow-x-auto mb-4 text-sm font-mono;
  }
  :global(.prose blockquote) {
    @apply border-l-4 border-purple-200 dark:border-purple-900 pl-4 italic my-4;
  }
  :global(.prose img) {
    @apply rounded-lg shadow-md max-w-full my-4 border border-neutral-200 dark:border-neutral-700;
  }

  .animate-fade-in {
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
