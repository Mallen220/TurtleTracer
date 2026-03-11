## 2025-03-04 - Unnecessary path length calculation in animation layers

**Learning:** The `generateOnionLayers` function in `src/utils/animation.ts` calculated the total length of the entire path up front via curve sampling, just to determine an upper bound for drawing evenly-spaced robot shapes. This effectively doubled the work done when rendering onion skin layers, as it later performs the same distance sampling pass again to calculate the actual layer positions.
**Action:** Removed the first pre-calculation pass. The condition `nextLayerDistance <= totalLength` was unnecessary because the loop implicitly ends when it finishes processing the last segment and accumulated distance naturally stops increasing. This removes an O(n \* samples) pass when rendering layers.
