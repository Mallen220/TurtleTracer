# Feature Planning - Advanced Path Analysis

## Identify

I see `d3` is in `dependencies`!

```json
    "d3": "^7.9.0",
```

This is perfect. I can use D3 to create rich charts.

## Select

I will create a "Graphs" tab in `PathStatisticsDialog.svelte` using D3 to visualize:

1.  **Velocity Profile**: Linear Velocity vs Time.
2.  **Angular Velocity Profile**: Angular Velocity vs Time.

I will also include **Acceleration Profiles** if possible, but velocity is the most critical first step.

## Implementation Plan

1.  **Modify `PathStatisticsDialog.svelte`**:
    - Add state for `activeTab` ("summary" | "graphs").
    - Add a tab switcher UI.
    - When "graphs" is active, render the graph container.
2.  **Create D3 Charts**:
    - Extract the motion profile data from `timePrediction` (which is already calculated in `calculateStats`).
    - Use D3 to render line charts.
    - I'll need to construct a continuous dataset from the segments.
3.  **Data Preparation**:
    - Iterate through the timeline events in `timePrediction.timeline`.
    - For each "travel" event, extract `motionProfile` (time vs distance) and derive velocity.
    - Or check if `velocityProfile` is already available in the event object (I recall seeing it in `types.ts`).

    Looking at `src/types.ts`:

    ```typescript
    export interface TimelineEvent {
      // ...
      // Detailed velocity profile for travel events: maps step index to velocity
      velocityProfile?: number[];
      // ...
    }
    ```

    It seems `velocityProfile` is available! This simplifies things greatly.

4.  **Verify**:
    - Run the app and check the new tab.
    - Ensure graphs update when path changes.

## Refined Plan

1.  _Update `PathStatisticsDialog.svelte`_
    - Add tab navigation.
    - Add logic to aggregate `velocityProfile` from all events into a single time-series dataset.
    - Use D3 to draw the charts.

Let's start by creating a reproduction/test case or just implementing it directly since I can't easily run the UI in this environment (headless). I'll have to rely on code review and `npm run build` / `npm run test`.

I'll first read `src/utils/timeCalculator.ts` to see how `velocityProfile` is populated, to ensure I understand the data format.

2026-01-21 - Formatting Noise
Learning: Running 'npm run format' on the entire project can introduce significant noise in PRs, making review difficult.
Action: Restore unrelated files after formatting using 'git restore' or 'git checkout', or scope formatting to changed files.

2026-01-21 - Playwright Verification
Learning: Frontend verification scripts must handle application-level overlays (like Onboarding and What's New dialogs) that can intercept clicks.
Action: Always check for and dismiss potential overlays in verification scripts before interacting with the main UI.
