## 2026-01-05 - [Menu Item Hit Areas]

**Learning:** In dropdown menus containing boolean toggles, restricting the click area to just the icon or checkbox frustrates users (Fitts' Law). Users expect the entire row (label + control) to be interactive.
**Action:** When creating menu items with toggles, wrap the entire row in a `<button>` with `role="menuitemcheckbox"` to maximize the hit area and improve accessibility.

## 2026-01-06 - [Sticky Table Header in Flex Container]

**Learning:** When making a table header sticky (`sticky top-0`) within a flex container that has `overflow-x-auto` (common for responsive tables), the sticky behavior often breaks because the wrapper `div` scrolls away with the document.
**Action:** To fix this, constrain the wrapper `div` height (e.g., `max-h-[70vh]`) and set `overflow-auto` (handling both axes). This creates a local scrolling context where the header can stick to the top of the wrapper, preserving context for long lists.
