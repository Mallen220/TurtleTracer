# Feature Journal

2024-05-23 - [Configurable Telemetry Export]
Learning: Hardcoded dependencies in generated code significantly limit the "out of the box" usability for teams with different software stacks.
Action: Always provide configuration options for external library dependencies in code generators.

2024-05-24 - [Smart Object Snapping]
Learning: When validating UI changes with Playwright, standard click actions on overlay elements (like Settings tabs) may be intercepted by the underlying field canvas layer.
Action: Use `{ force: true }` for clicks on dialog elements that overlay the canvas, or explicitly assert pointer-events status before interacting.
