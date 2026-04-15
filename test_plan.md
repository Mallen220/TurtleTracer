1. **Update `handleKeydown` to save on escape**
   - Modify `handleKeydown` in `SettingsDialog.svelte` to invoke `handleSave()` when `Escape` is pressed.
2. **Add click-away saving**
   - Add `onclick` to the outer `<div role="dialog">` that handles clicking away. When clicked, if `e.target === e.currentTarget`, invoke `handleSave()`.
3. **Verify**
   - Confirm changes compile and run without errors.
4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
5. **Submit the change.**
