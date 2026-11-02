<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  // Marks a feature that only works on the robot with TurtleTracerLib, so a
  // team knows to add the library before relying on it. It links to the docs.
  import { InfoIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    /** The docs page for the feature; the library's overview by default. */
    href?: string;
  }

  let { href = "https://www.turtletracer.com/turtle-tracer-lib/" }: Props =
    $props();

  const TEXT = "Requires TurtleTracerLib";
</script>

<a
  {href}
  target="_blank"
  rel="noopener noreferrer"
  class="group relative inline-flex items-center text-neutral-400 hover:text-emerald-600 focus-visible:text-emerald-600 dark:text-neutral-500 dark:hover:text-emerald-400 dark:focus-visible:text-emerald-400 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
  aria-label="{TEXT} (opens the docs)"
  data-testid="turtletracerlib-badge"
>
  <InfoIcon className="size-4" />
  <span
    class="{ui.tooltip} absolute left-full top-1/2 -translate-y-1/2 ml-1.5 z-50 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150"
    aria-hidden="true"
  >
    {TEXT}
  </span>
</a>
