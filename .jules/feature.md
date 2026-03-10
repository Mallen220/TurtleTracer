2026-02-28 - [Discoverability of Hidden Commands]
Learning: [While powerful commands like `splitPath` can exist via keyboard shortcuts (e.g. CommandPalette), they are often undiscoverable by average users. The request to add a simple visual scissors button in the timeline playback demonstrates the importance of exposing key functionality directly in relevant context areas.]
Action: [When building new powerful editor features, always ensure they are exposed in the core UI near related functionality, rather than burying them entirely in shortcuts or context menus.]

2024-05-24 - [Digital Strategy Notes]
Learning: Replacing static printed lines with an editable textarea linked to the project store allows users to draft their strategy before printing or exporting. This reduces manual work and ensures notes persist with the file.
Action: Look for opportunities to upgrade read-only or print-only dialogs with active state management that adds tangible user value.

2024-10-24 - [Contextualizing Sequence Statistics]
Learning: Users often need to see the time/distance impact of individual segments without opening global dialogs. Extracting the `timePrediction.timeline` data and displaying it inline within the sequence list (`WaypointTable`) provides immediate feedback.
Action: When building complex sequences, expose the derived/simulated data (like start/end times) directly alongside the editable items to tighten the feedback loop.

2026-03-10 - [Hide/Show Path Visibility Feature]
Learning: Features that filter out data entirely from simulation and code generation can cause dangerous disconnects in visual trajectory stitching (i.e. if Path 2 is removed, Path 3 visually starts from Path 2's endpoint but exported code has it starting from Path 1). It is often better to implement purely visual filters (like 'Hide') that leave the core data and simulation logic intact, ensuring what you simulate is exactly what you export.
Action: Next time a user requests to 'disable' or 'hide' a segment of a larger sequence, clarify whether the exclusion should affect simulation/export or just rendering. Prefer separating visual state (e.g., hidden) from structural state (e.g., deleted/disabled) to avoid complex stitching and state desyncs.
