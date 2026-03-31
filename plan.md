1. **Understand the problem**:
   - The user is reporting that the export code dialog (`ExportCodeDialog.svelte`) loads extremely slowly on browsers and is laggy when scrolling.
   - The primary suspect is this loop in `ExportCodeDialog.svelte`:
     ```svelte
     {#each exportedCode.split("\n") as line, i}
       <div
         data-line-index={i}
         class="w-full {searchMatches.includes(i) ? 'bg-yellow-500/30' : 'bg-transparent'}"
         style="height: 1.625em;"
       ></div>
     {/each}
     ```
     Creating thousands of `div` elements for every single line of code (often 1000s of lines) can cripple the DOM.
     Furthermore, `searchMatches.includes(i)` is an `O(N)` operation run inside the loop, meaning an `O(N * M)` complexity where `N` is the number of lines and `M` is the number of matches.
     Additionally, `exportedCode.split("\n")` runs reactively multiple times.
     And we're doing it simply to position yellow highlights for search matches!
2. **Solution**:
   - We don't need a div for *every* single line of code. We only need `div`s for the lines that *actually have* a match!
   - We can position the highlight matches using `top: calc({i} * 1.625em);` or simply `top: {i * 1.625}em;` on absolute positioned divs.
   - However, we also use the empty `div`s for scrolling using `data-line-index={i}` via `document.querySelector('[data-line-index="..."]').scrollIntoView()`.
   - But we don't *need* DOM elements for scrolling. We could just calculate the scroll position! If each line is `1.625em`, we can convert that to pixels or simply scroll the container to the computed pixel offset. Or, if we just render invisible anchors for the *matches*, we could scroll to those anchors.
   - Let's change the scrolling mechanism:
     ```javascript
     function scrollToMatch(lineIndex: number) {
       if (scrollContainer) {
         // Instead of finding a div and calling scrollIntoView, we compute the offset:
         // 1.625em is the line height.
         // Let's get the computed font size of the scroll container to find the exact pixel height of 1em.
         // Or even simpler, we only render divs for `searchMatches` and we can scroll to them!
         const el = scrollContainer.querySelector(`[data-line-index="${lineIndex}"]`);
         if (el) ...
       }
     }
     ```
     Wait, if we only render `div`s for `searchMatches`, then `document.querySelector('[data-line-index="..."]')` will *only* find elements for matches, which is exactly what `scrollToMatch(lineIndex)` does! It's always called with a match index.
3. **Refactoring the Highlight Layer**:
   - Replace the `{#each exportedCode.split("\n") as line, i}` block with:
     ```svelte
     {#each searchMatches as matchIndex}
       <div
         data-line-index={matchIndex}
         class="absolute left-0 right-0 bg-yellow-500/30"
         style="top: calc({matchIndex} * 1.625em); height: 1.625em;"
       ></div>
     {/each}
     ```
   - Make sure the highlight layer has `position: relative` or `absolute` and `left-0 right-0`, and we remove `transform: translateY(1.0em)` from the parent, or adjust the math. Wait, the parent had `transform: translateY(1.0em);` and `padding` handling.
     Let's look at the parent:
     ```svelte
          <div
            class="absolute top-4 left-4 right-4 bottom-20 pointer-events-none select-none font-mono text-sm leading-relaxed"
            aria-hidden="true"
            style="transform: translateY(1.0em);"
          >
     ```
     If we render absolute matches relative to this container, they will be properly aligned:
     ```svelte
     {#each searchMatches as matchIndex (matchIndex)}
        <div
          data-line-index={matchIndex}
          class="absolute left-0 right-0 bg-yellow-500/30"
          style="top: calc({matchIndex} * 1.625em); height: 1.625em;"
        ></div>
     {/each}
     ```
   - This prevents rendering thousands of elements and removes the `O(N * M)` includes check.
4. **Pre-commit step**: Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.
