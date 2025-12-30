## 2024-05-23 - Performance Optimization of Field Interaction

**Learning:** `document.elementFromPoint` is extremely expensive (O(N) layout thrashing) when called inside high-frequency event listeners like `mousemove`. Replacing it with `evt.target` (O(1)) significantly improves performance for interaction loops.
**Action:** Always prefer `evt.target` over `document.elementFromPoint` when dealing with events bubbling from SVG or DOM elements, unless you specifically need to hit-test through overlays.

## 2024-05-23 - Fuzz Test Precision Issues

**Learning:** Floating point modulo operations can introduce precision errors larger than `1e-9` when inputs are large (e.g. 3600).
**Action:** When fuzz testing angular calculations, normalize inputs to a reasonable range (e.g. [-360, 360]) or increase epsilon tolerance for larger inputs.
