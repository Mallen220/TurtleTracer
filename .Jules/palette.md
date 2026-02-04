## 2024-05-22 - Actionable Empty States & Invisible Inputs

Learning: Empty states are prime real estate for guiding users, not just informing them. Also, when wrapping native inputs (like `<input type="color">`) for custom styling, keyboard accessibility is frequently lost because the focus ring ends up on the invisible input.
Action: Always verify `focus-within` styles on custom input wrappers and elevate primary actions into empty state slots.

## 2024-05-22 - Unreachable Empty States

Learning: Implemented "Add Path" buttons in the Empty State for `PathTab`, but discovered that the app prevents deleting the last line (`if (lines.length <= 1) return;`). This makes the Empty State unreachable for the user, rendering the UX improvement invisible.
Action: Before optimizing empty states, verify they are actually reachable in the application flow. Consider relaxing "at least one item" constraints to allow true empty states.

## 2026-01-26 - Invisible Focus on Styled Range Inputs

Learning: Removing default outlines (`focus:outline-none`) on range inputs (`<input type="range">`) to achieve a custom look creates a significant accessibility barrier. Keyboard users cannot see the focus state on the slider thumb.
Action: Always add explicit `focus-visible` styles (e.g., `focus-visible:ring`) to the slider or its container when removing default outlines.

## 2026-05-24 - Combobox Pattern & Transition Testing

Learning: Implementing a fully accessible Searchable Dropdown (Combobox) requires careful coordination of `aria-activedescendant` and `keydown` event handling. A critical gotcha in testing is that Svelte transitions (like `slide`) keep elements in the DOM even after the state variable flips to false, causing `toBeInTheDocument` assertions to fail unexpectedly in unit tests.
Action: Use `aria-expanded` on the input to verify state changes in tests rather than relying on the presence/absence of the listbox when transitions are involved, or mock the transitions entirely.
