2026-03-01 - [Contextual Visual Feedback During Manipulation]
Learning: Providing a ghost outline of the robot at the exact waypoint being dragged allows users to instantly perform collision checks mentally without needing to play the timeline or scrub animation. This drastically reduces the trial-and-error cycle of adjusting points near field boundaries.
Action: Whenever a user interacts with a spatial element (like dragging a waypoint), consider what other contextual information (like bounding boxes, footprints, or snap guides) can be visualized transiently to help them make better spatial decisions.

2026-02-28 - [Discoverability of Hidden Commands]
Learning: [While powerful commands like `splitPath` can exist via keyboard shortcuts (e.g. CommandPalette), they are often undiscoverable by average users. The request to add a simple visual scissors button in the timeline playback demonstrates the importance of exposing key functionality directly in relevant context areas.]
Action: [When building new powerful editor features, always ensure they are exposed in the core UI near related functionality, rather than burying them entirely in shortcuts or context menus.]

2024-05-24 - [Digital Strategy Notes]
Learning: Replacing static printed lines with an editable textarea linked to the project store allows users to draft their strategy before printing or exporting. This reduces manual work and ensures notes persist with the file.
Action: Look for opportunities to upgrade read-only or print-only dialogs with active state management that adds tangible user value.
