<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";
  import { fileNameOf } from "../../../utils/fileHandlers";

  interface Props {
    menu: { x: number; y: number; file: FileInfo };
    lockFolders?: boolean;
    /** Everything selected, when the menu was opened on part of a multi-selection. */
    selectedPaths?: string[];
    primaryPath?: string | null;
    onclose: () => void;
    onaction: (action: string) => void;
  }

  let {
    menu,
    lockFolders = false,
    selectedPaths = [],
    primaryPath = null,
    onclose,
    onaction,
  }: Props = $props();

  const many = $derived(
    selectedPaths.length > 1 && selectedPaths.includes(menu.file.path),
  );
</script>

<FileContextMenu
  x={menu.x}
  y={menu.y}
  fileName={menu.file.name}
  isDirectory={menu.file.isDirectory}
  canChange={!(lockFolders && menu.file.isDirectory)}
  selectionCount={many ? selectedPaths.length : 1}
  primaryName={many ? fileNameOf(primaryPath ?? "") : ""}
  {onclose}
  {onaction}
/>
