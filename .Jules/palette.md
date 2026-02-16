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

## 2026-05-24 - Reusable Destructive Action Pattern

Learning: Hardcoding layout utilities (like `ml-1`) in reusable components like `DeleteButtonWithConfirm` limits their use in tight spaces (like tables or dense toolbars).
Action: Keep reusable components layout-neutral (padding/dimensions only) and delegate spacing/margins to the parent context via className props.

## 2026-05-25 - Live Regions for Search Feedback

Learning: Visual search results update instantly, but screen reader users get no feedback when filtering lists unless a live region is present.
Action: Always pair filterable lists with a visually hidden `aria-live="polite"` element that announces "X results found" when the count changes.

## 2026-05-25 - Resizable Panels Accessibility

Learning: Custom resizable panels often lack keyboard support, making them inaccessible. Adding `on:keydown` handlers for Arrow keys to adjust the panel size provides a significant accessibility win.
Action: Always add keyboard support to custom resizers and ensure they have visible focus states.

## 2026-05-26 - Responsive Sidebar Inputs

Learning: Fixed width inputs (e.g., `w-20`) in a resizable sidebar create a poor user experience when the sidebar is narrowed or expanded. Users expect inputs to fill the available space. Using `flex-1` with `min-w` ensures inputs scale gracefully and wrapping containers (`flex-wrap`) prevent overflow in narrow states.
Action: Avoid fixed widths for form controls in resizable containers; use flex-grow and wrapping instead.
