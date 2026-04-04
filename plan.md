1. **Understand the problem:** The path optimizer is slow. The optimizer runs a genetic algorithm, evaluating fitness for many paths.
2. **Identify bottleneck:** `getCollisions` calculates path validity. It performs complex geometry checks (`pointInPolygon` and `getRobotCorners`) on multiple objects every 0.2 seconds of path time for *every* candidate path in the population.
3. **Propose optimization:** Implement Axis-Aligned Bounding Box (AABB) checks.
   - Pre-calculate AABBs for all obstacles and keep-in zones in the `PathOptimizer` constructor.
   - In `getCollisions`, dynamically calculate the AABB of the robot based on its corners at each time step.
   - Use a simple AABB intersection check to quickly reject non-colliding objects before doing the expensive polygon and corner calculations.
4. **Implement changes in `src/utils/pathOptimizer.ts`:**
   - Define AABB properties (`obstacleAABBs`, `keepInZoneAABBs`).
   - Populate them in the constructor.
   - Integrate the fast AABB rejection logic in `getCollisions` for both obstacle checks and keep-in zone checks.
5. **Pre-commit checks:** Complete pre commit steps to ensure proper testing, verification, review, and reflection are done.
6. **Submit the changes.**
