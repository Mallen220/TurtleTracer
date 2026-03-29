1. **Replace SVG in `src/lib/components/HeadingControls.svelte`**
   - Create `src/lib/components/icons/ArrowRightLeftIcon.svelte` using `write_file`.
   - Update `src/lib/components/icons/index.ts` using `replace_with_git_merge_diff` to export it.
   - Update `src/lib/components/HeadingControls.svelte` by importing `ArrowRightLeftIcon` and replacing the `<svg>` at line 261 using `replace_with_git_merge_diff`.

2. **Replace SVGs in `src/lib/components/sections/MacroTransformControls.svelte`**
   - Create `src/lib/components/icons/ArrowsPointingOutIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/ArrowsRightLeftIcon.svelte` using `write_file`.
   - Update `src/lib/components/icons/index.ts` using `replace_with_git_merge_diff` to export them.
   - Import `ArrowsPointingOutIcon`, `ArrowPathIcon`, `ArrowsRightLeftIcon`, `ChevronUpIcon`, `ChevronDownIcon`, `TrashIcon` in `MacroTransformControls.svelte` using `replace_with_git_merge_diff`.
   - Replace the corresponding `<svg>` blocks with these components using `replace_with_git_merge_diff`.

3. **Replace SVGs in `src/lib/components/PlaybackControls.svelte`**
   - Create `src/lib/components/icons/ScissorsIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/BackwardStepIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/BackwardIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/ForwardIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/ForwardStepIcon.svelte` using `write_file`.
   - Update `src/lib/components/icons/index.ts` using `replace_with_git_merge_diff` to export them.
   - Import the new icons and `ChevronDownIcon`, `CheckIcon`, `PlaySolidIcon`, `PauseIcon`, `ArrowPathIcon` in `PlaybackControls.svelte` using `replace_with_git_merge_diff`.
   - Replace inline SVGs with imported icon components using `replace_with_git_merge_diff`.

4. **Replace SVGs in `src/lib/components/WaypointTable.svelte`**
   - Create `src/lib/components/icons/ClipboardDocumentIcon.svelte` using `write_file`.
   - Create `src/lib/components/icons/Bars3Icon.svelte` (for drag handle) using `write_file`.
   - Update `src/lib/components/icons/index.ts` using `replace_with_git_merge_diff` to export the new icons.
   - Import the new icons and `InfoIcon`, `LinkIcon` using `replace_with_git_merge_diff`.
   - Replace the `<svg>` blocks using `replace_with_git_merge_diff`.

5. **Replace SVGs in `src/lib/components/GlobalEventMarkers.svelte`**
   - Import `ZapIcon` from `src/lib/components/icons/ZapIcon.svelte` and replace the inline SVG using `replace_with_git_merge_diff`.

6. **Testing and Verification**
   - Use `list_files` to confirm the creation of the new icon files.
   - Use `read_file` to confirm the Svelte component modifications.
   - Run compilation checks (`npm run check`) and tests (`npm run test -- --run`) using `run_in_bash_session`.

7. **Pre-commit and Submit**
   - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.
