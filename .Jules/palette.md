## PALETTE'S JOURNAL

## 2026-01-15 - Inline Actions over Native Dialogs

Learning: Native `confirm()` dialogs are disruptive and cannot be styled. Users prefer inline confirmation (like "Click again to confirm") for destructive or major actions within a settings context.
Action: Use `DeleteButtonWithConfirm` or similar inline confirmation patterns for actions like "Delete" or "Update" to maintain flow and visual consistency.

## 2026-01-16 - Dropdown Menu Accessibility
Learning: Custom dropdown menus in this app (Navbar, PlaybackControls) were implemented using divs and buttons but lacked standard ARIA keyboard navigation (Arrow keys, Home, End). They only relied on Tab and Click.
Action: Created a reusable Svelte action `menuNavigation` to encapsulate this logic and applied it to existing menus. Future menus should use this action or a standardized Menu component.
