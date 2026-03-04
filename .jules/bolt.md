## 2023-10-27 - Math.hypot Performance in V8

**Learning:** `Math.hypot()` is significantly slower than manual `Math.sqrt(dx*dx + dy*dy)` due to its internal checks to prevent underflow/overflow. In this codebase where distances are calculated thousands of times per second (e.g. within curve/path algorithms over a 144x144 inch field), using `Math.sqrt` provides a measurable speedup.
**Action:** Avoid `Math.hypot` for performance-critical 2D point distance calculations unless dealing with values where precision/overflow is a genuine risk.
