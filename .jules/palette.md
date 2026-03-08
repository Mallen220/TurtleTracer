## 2024-05-18 - Accessibility checks on buttons

Learning: I checked the CodeTab and PlaybackControls and they were surprisingly already accessible, with proper aria-labels on buttons. I learned that I can grep for `<button` and `aria-label` to find buttons without labels.

Action: Ensure I continue to verify that buttons, especially icon-only ones, have aria-labels to maintain this level of accessibility.

## 2026-03-07 - Adding ARIA labels to utility buttons

Learning: Many small utility buttons, like closing modals, switching tabs, or adjusting values, were missing accessible `aria-label`s despite earlier audits. This makes it difficult for screen reader users to understand their function.
Action: I will actively search for buttons that use icons without text, or tab controls without `aria-label`s and fix them to improve accessibility across the UI.
