<script>
  let exportedCode = "hello\nworld\nfoo\nbar";
  let searchMatches = [1, 3];
</script>

<div class="container relative p-4 pb-20 overflow-auto h-64 border">
  <div class="absolute top-4 left-4 right-4 bottom-20 pointer-events-none select-none font-mono text-sm leading-relaxed">
    {#each searchMatches as matchIndex}
      <div
        data-line-index={matchIndex}
        class="absolute left-0 right-0 bg-yellow-500/30"
        style="top: {matchIndex * 1.625}em; height: 1.625em;"
      ></div>
    {/each}
  </div>
  <pre class="relative z-10">{exportedCode}</pre>
</div>
