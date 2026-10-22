<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ui } from "../../ui";
  import { codeLanguageOfFile } from "../../../utils/fileExtensions";

  let { name }: { name: string } = $props();
  const kotlin = $derived(codeLanguageOfFile(name) === "kotlin");
</script>

<!-- Marks a Java or Kotlin auto file containing importable path data. -->
<span
  class="{ui.badge.info} shrink-0 leading-none"
  title="A {kotlin ? 'Kotlin' : 'Java'} auto file with importable paths."
  >{kotlin ? ".kt" : ".java"}</span
>
