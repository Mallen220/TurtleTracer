<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Shows what the translational P gain does in a fixed example corner. -->
<script lang="ts">
  import { previewTranslationalGain } from "../../../../utils/timeCalculator/gainPreview";
  import type { Settings } from "../../../../types";

  let { settings }: { settings: Settings } = $props();

  const preview = $derived(previewTranslationalGain(settings));

  // Fit the whole example into the picture.
  const WIDTH = 240;
  const HEIGHT = 150;
  const PAD = 10;
  // Only the corner and what the robot does there matter, not the whole path.
  const shownPath = $derived.by(() => {
    const reach = Math.max(...preview.trace.map((p) => p.y)) + 6;
    const top = Math.max(preview.joint.y + 25, reach);
    return preview.path.filter((p) => p.y <= top);
  });
  const view = $derived.by(() => {
    const points = [...preview.trace, ...shownPath, preview.from];
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const scale = Math.min(
      (WIDTH - 2 * PAD) / Math.max(1, maxX - minX),
      (HEIGHT - 2 * PAD) / Math.max(1, maxY - minY),
    );
    return {
      x: (x: number) => PAD + (x - minX) * scale,
      // Field y grows upward; the picture's grows downward.
      y: (y: number) => HEIGHT - PAD - (y - minY) * scale,
    };
  });
  const line = (points: { x: number; y: number }[]) =>
    points
      .map((p) => `${view.x(p.x).toFixed(1)},${view.y(p.y).toFixed(1)}`)
      .join(" ");

  const verdictText = $derived(
    preview.verdict === "good" ? "Tracks the path well" : "Swings wide",
  );
  const verdictClass = $derived(
    preview.verdict === "good"
      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  );
</script>

<div
  class="mb-4 -mt-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3 text-xs text-neutral-600 dark:text-neutral-400"
  data-testid="gain-preview"
>
  <div class="flex flex-wrap items-start gap-3">
    <svg
      viewBox="0 0 {WIDTH} {HEIGHT}"
      width={WIDTH}
      height={HEIGHT}
      class="shrink-0 rounded bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
      role="img"
      aria-label="A robot at top speed meets a right-angle turn and is steered back onto the path"
    >
      <polyline
        points={line([preview.from, preview.joint])}
        fill="none"
        stroke="#a3a3a3"
        stroke-width="1.5"
        stroke-dasharray="3 3"
      />
      <polyline
        points={line(shownPath)}
        fill="none"
        stroke="#a3a3a3"
        stroke-width="2"
      />
      <polyline
        points={line(preview.trace)}
        fill="none"
        stroke="#7c3aed"
        stroke-width="2"
        data-testid="gain-preview-route"
      />
      <circle
        cx={view.x(preview.joint.x)}
        cy={view.y(preview.joint.y)}
        r="3"
        fill="#525252"
      />
    </svg>
    <div class="min-w-[10rem] flex-1 space-y-1">
      <span
        class="inline-block rounded px-2 py-0.5 font-medium {verdictClass}"
        data-testid="gain-preview-verdict">{verdictText}</span
      >
      <ul class="space-y-0.5">
        <li>
          Swings <strong data-testid="gain-preview-overshoot"
            >{preview.overshoot.toFixed(1)}</strong
          > in past the path
        </li>
        <li>
          {#if preview.settled}
            Back on it after
            <strong data-testid="gain-preview-time"
              >{preview.duration.toFixed(1)}</strong
            > s
          {:else}
            <strong data-testid="gain-preview-time">Never settles</strong>
          {/if}
        </li>
      </ul>
    </div>
  </div>
  <p class="mt-3 leading-snug">
    The simulation assumes a robot that responds cleanly, so a higher P always
    swings less here. Real robots add sensor noise and delays that can make a
    very high P jitter. If yours is stable at your value, it's fine.
  </p>
</div>
