<script lang="ts">
  import { settingsStore } from "../../projectStore";

  export let degrees: number = 0;
  export let size: number = 16;
  export let className: string = "";

  $: offset =
    $settingsStore.fieldOrientation === "Red Left"
      ? 180
      : $settingsStore.fieldOrientation === "Blue Right"
        ? 180
        : 0;
</script>

<div
  class="inline-flex items-center justify-center shrink-0 {className}"
  style="transform: rotate({-(
    degrees + offset
  )}deg); width: {size}px; height: {size}px; transition: transform 0.2s ease-out;"
  role="presentation"
  aria-hidden="true"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full text-purple-600 dark:text-purple-400"
  >
    <!-- Arrow pointing RIGHT (0 degrees) -->
    <!-- Line: (4, 12) -> (20, 12) -->
    <!-- Head: (14, 6) -> (20, 12) -> (14, 18) -->
    <path d="M4 12h16m-6-6l6 6-6 6" />
  </svg>
</div>
