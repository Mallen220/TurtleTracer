
## 2024-05-19 - Optimization of Math.pow for small integer and 1.5 powers
**Learning:** `Math.pow(val, 1.5)` in TS/JS engines is significantly slower than doing `val * Math.sqrt(val)`, especially inside tight loops like those found in `timeCalculator.ts`. Same applies to `Math.pow(val, 2)` versus `val * val` (variable squaring). Replacing these built-ins with explicit operations yields a large speedup with no readability cost.
**Action:** When working on math-heavy hot paths (e.g. `timeCalculator.ts`, `pathOptimizer.ts`), prefer direct multiplication or combined Math.sqrt operations for exponents 2, 3, or 1.5 instead of `Math.pow`.
