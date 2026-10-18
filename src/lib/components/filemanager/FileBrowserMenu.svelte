<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { FileInfo } from "../../../types";
  import FileContextMenu from "./FileContextMenu.svelte";

  interface Props {
    menu: { x: number; y: number; file: FileInfo };
    lockFolders?: boolean;
    onclose: () => void;
    onaction: (action: string) => void;
  }

  let { menu, lockFolders = false, onclose, onaction }: Props = $props();
</script>

<FileContextMenu
  x={menu.x}
  y={menu.y}
  fileName={menu.file.name}
  isDirectory={menu.file.isDirectory}
  canChange={!(lockFolders && menu.file.isDirectory)}
  {onclose}
  {onaction}
/>
