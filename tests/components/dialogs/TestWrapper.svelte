<script lang="ts">
  import StrategySheetPreview from "../../../src/lib/components/dialogs/StrategySheetPreview.svelte";
  import type { Point, Line, SequenceItem, Settings } from "../../../src/types";

  interface Props {
    isOpen?: boolean;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    settings: Settings;
    timePrediction: any;
  }

  let {
    isOpen = $bindable(false),
    startPoint,
    lines,
    sequence,
    settings,
    timePrediction,
  }: Props = $props();

  export function getIsOpen() {
    return isOpen;
  }
</script>

<StrategySheetPreview
  bind:isOpen
  {startPoint}
  {lines}
  {sequence}
  {settings}
  {timePrediction}
/>
