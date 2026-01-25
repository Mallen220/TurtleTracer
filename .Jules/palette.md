## 2024-05-22 - Actionable Empty States & Invisible Inputs
Learning: Empty states are prime real estate for guiding users, not just informing them. Also, when wrapping native inputs (like `<input type="color">`) for custom styling, keyboard accessibility is frequently lost because the focus ring ends up on the invisible input.
Action: Always verify `focus-within` styles on custom input wrappers and elevate primary actions into empty state slots.

## 2024-05-22 - Unreachable Empty States
Learning: Implemented "Add Path" buttons in the Empty State for `PathTab`, but discovered that the app prevents deleting the last line (`if (lines.length <= 1) return;`). This makes the Empty State unreachable for the user, rendering the UX improvement invisible.
Action: Before optimizing empty states, verify they are actually reachable in the application flow. Consider relaxing "at least one item" constraints to allow true empty states.
