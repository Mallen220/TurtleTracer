## 2026-01-05 - [Menu Item Hit Areas]

**Learning:** In dropdown menus containing boolean toggles, restricting the click area to just the icon or checkbox frustrates users (Fitts' Law). Users expect the entire row (label + control) to be interactive.
**Action:** When creating menu items with toggles, wrap the entire row in a `<button>` with `role="menuitemcheckbox"` to maximize the hit area and improve accessibility.
