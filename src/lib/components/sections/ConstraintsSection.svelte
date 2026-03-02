<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Line } from "../../../types/index";
  import { tooltipPortal } from "../../actions/portal";

  export let line: Line;
  export let collapsed: boolean = true;
  export let recordChange: (action?: string) => void;

  function handleInput() {
    recordChange("Update Constraints");
  }

  $: {
    if (!line.constraints) {
      line.constraints = {};
    }
  }

  function toggleCollapsed() {
    collapsed = !collapsed;
  }

  // Tooltip anchors and states
  let hoveredHoverId: string | null = null;
  let hoveredHoverAnchor: HTMLElement | null = null;

  function handleHoverEnter(e: MouseEvent, id: string) {
    hoveredHoverId = id;
    hoveredHoverAnchor = e.currentTarget as HTMLElement;
  }
  
  function handleHoverLeave() {
    hoveredHoverId = null;
    hoveredHoverAnchor = null;
  }

  // Workaround for Svelte typescript bindings
  $: constraints = line.constraints!;
</script>

<div class="mt-4 border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden bg-white dark:bg-neutral-800">
  <button
    on:click|stopPropagation={toggleCollapsed}
    class="w-full flex items-center justify-between p-2.5 bg-neutral-50 dark:bg-neutral-900/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
  >
    <div class="flex items-center gap-2">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2.5"
        stroke="currentColor"
        class="size-3.5 text-neutral-500 transition-transform duration-200 {collapsed ? '-rotate-90' : 'rotate-0'}"
      >
        <path stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
      </svg>
      <span class="text-xs font-bold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">Path Constraints</span>
    </div>
    <div class="flex items-center gap-2">
      <span class="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300">
        {Object.values(line.constraints || {}).filter(v => v !== undefined && v !== null && v !== "").length} Active
      </span>
    </div>
  </button>

  {#if !collapsed}
    <div class="p-3 bg-white dark:bg-neutral-800 border-t border-neutral-200 dark:border-neutral-700 grid grid-cols-2 gap-3">
      
      <!-- Timeout -->
      <div class="space-y-1">
        <label for={`timeout-${line.id}`} class="text-xs font-medium text-neutral-500 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span>Timeout (ms)</span>
            <div class="relative flex items-center">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                class="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-500 cursor-help transition-colors"
                on:mouseenter={(e) => handleHoverEnter(e, `timeout-${line.id}`)}
                on:mouseleave={handleHoverLeave}
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              {#if hoveredHoverId === `timeout-${line.id}`}
                <div 
                  use:tooltipPortal={hoveredHoverAnchor}
                  class="w-64 p-2 bg-neutral-900 text-white text-[10px] leading-relaxed rounded shadow-xl z-50 pointer-events-none"
                >
                <div class="font-bold mb-1">Timeout Constraint</div>
                How long the follower has to correct after stopping before the path is considered complete.<br/><br/>
                <span class="text-purple-300">Recommended:</span> Increase for better accuracy at the end of the path. Decrease for faster transitions between paths.
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                </div>
              {/if}
            </div>
          </div>
        </label>
        <input
          id={`timeout-${line.id}`}
          type="number"
          min="0"
          step="100"
          class="w-full px-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
          bind:value={constraints.timeout}
          on:change={handleInput}
          disabled={line.locked}
          placeholder="e.g. 500"
        />
      </div>

      <!-- TValue -->
      <div class="space-y-1">
        <label for={`tvalue-${line.id}`} class="text-xs font-medium text-neutral-500 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span>T-Value (0.0 - 1.0)</span>
            <div class="relative flex items-center">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                class="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-500 cursor-help transition-colors"
                on:mouseenter={(e) => handleHoverEnter(e, `tvalue-${line.id}`)}
                on:mouseleave={handleHoverLeave}
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              {#if hoveredHoverId === `tvalue-${line.id}`}
                <div 
                  use:tooltipPortal={hoveredHoverAnchor}
                  class="w-64 p-2 bg-neutral-900 text-white text-[10px] leading-relaxed rounded shadow-xl z-50 pointer-events-none"
                >
                <div class="font-bold mb-1">T-Value Constraint</div>
                The parametric end criteria. How much of the path the robot must follow before it is considered complete.<br/><br/>
                <span class="text-purple-300">Recommended:</span> 0.95 to 0.99. If the robot gets stuck at the end of a path, try decreasing this slightly so it finishes earlier. Decreasing too much leads to incomplete paths. 
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                </div>
              {/if}
            </div>
          </div>
        </label>
        <input
          id={`tvalue-${line.id}`}
          type="number"
          min="0"
          max="1"
          step="0.05"
          class="w-full px-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
          bind:value={constraints.tValue}
          on:change={handleInput}
          disabled={line.locked}
          placeholder="e.g. 0.95"
        />
      </div>

      <!-- Velocity -->
      <div class="space-y-1">
        <label for={`velocity-${line.id}`} class="text-xs font-medium text-neutral-500 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span>Velocity (in/s)</span>
            <div class="relative flex items-center">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                class="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-500 cursor-help transition-colors"
                on:mouseenter={(e) => handleHoverEnter(e, `velocity-${line.id}`)}
                on:mouseleave={handleHoverLeave}
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              {#if hoveredHoverId === `velocity-${line.id}`}
                <div 
                  use:tooltipPortal={hoveredHoverAnchor}
                  class="w-64 p-2 bg-neutral-900 text-white text-[10px] leading-relaxed rounded shadow-xl z-50 pointer-events-none"
                >
                <div class="font-bold mb-1">Velocity Constraint</div>
                The maximum velocity the robot must be below for the path to be considered complete.<br/><br/>
                <span class="text-purple-300">Recommended:</span> Low values (~1-3 in/s) for precise stops. Higher values if you want to flow into the next action before fully stopping.
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                </div>
              {/if}
            </div>
          </div>
        </label>
        <input
          id={`velocity-${line.id}`}
          type="number"
          min="0"
          step="1"
          class="w-full px-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
          bind:value={constraints.velocity}
          on:change={handleInput}
          disabled={line.locked}
          placeholder="e.g. 10"
        />
      </div>

      <!-- Translational -->
      <div class="space-y-1">
        <label for={`translational-${line.id}`} class="text-xs font-medium text-neutral-500 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span>Translational (in)</span>
            <div class="relative flex items-center">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                class="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-500 cursor-help transition-colors"
                on:mouseenter={(e) => handleHoverEnter(e, `translational-${line.id}`)}
                on:mouseleave={handleHoverLeave}
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              {#if hoveredHoverId === `translational-${line.id}`}
                <div 
                  use:tooltipPortal={hoveredHoverAnchor}
                  class="w-64 p-2 bg-neutral-900 text-white text-[10px] leading-relaxed rounded shadow-xl z-50 pointer-events-none"
                >
                <div class="font-bold mb-1">Translational Error Constraint</div>
                The maximum allowable translational (X/Y) error for the path to be considered complete.<br/><br/>
                <span class="text-purple-300">Recommended:</span> Small values (~0.5-1.0 in) for precision. Increase if the robot struggles to settle on the exact target.
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                </div>
              {/if}
            </div>
          </div>
        </label>
        <input
          id={`translational-${line.id}`}
          type="number"
          min="0"
          step="0.1"
          class="w-full px-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
          bind:value={constraints.translational}
          on:change={handleInput}
          disabled={line.locked}
          placeholder="e.g. 1.0"
        />
      </div>

      <!-- Heading -->
      <div class="space-y-1 col-span-2">
        <label for={`heading-${line.id}`} class="text-xs font-medium text-neutral-500 flex justify-between items-center">
          <div class="flex items-center gap-1.5">
            <span>Heading (deg)</span>
            <div class="relative flex items-center">
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 20 20" 
                fill="currentColor" 
                class="w-3.5 h-3.5 text-neutral-400 hover:text-neutral-500 cursor-help transition-colors"
                on:mouseenter={(e) => handleHoverEnter(e, `heading-${line.id}`)}
                on:mouseleave={handleHoverLeave}
              >
                <path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clip-rule="evenodd" />
              </svg>
              {#if hoveredHoverId === `heading-${line.id}`}
                <div 
                  use:tooltipPortal={hoveredHoverAnchor}
                  class="w-64 p-2 bg-neutral-900 text-white text-[10px] leading-relaxed rounded shadow-xl z-50 pointer-events-none"
                >
                <div class="font-bold mb-1">Heading Error Constraint</div>
                The maximum allowable rotational error for the path to be considered complete.<br/><br/>
                <span class="text-purple-300">Recommended:</span> Small values (~1-3 deg) for precision. Increase if the robot continues oscillating near the target heading.
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                </div>
              {/if}
            </div>
          </div>
        </label>
        <input
          id={`heading-${line.id}`}
          type="number"
          min="0"
          step="0.5"
          class="w-full px-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all disabled:opacity-50"
          bind:value={constraints.heading}
          on:change={handleInput}
          disabled={line.locked}
          placeholder="e.g. 2.0"
        />
      </div>

    </div>
  {/if}
</div>
