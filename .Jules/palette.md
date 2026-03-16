## 2024-03-16 - Visual Feedback for Interactive Resizers and Disabled States

Learning: While control tab resizers provide basic cursor changes, users often miss the affordance without explicit hover states on the handle element itself. Additionally, disabled actions (like "Download .java") need clear visual dimming to prevent user confusion.
Action: Add explicit `group` and `group-hover` utility classes to resizer child elements to give immediate, clear visual feedback when the hit area is entered, and apply `opacity-50 cursor-not-allowed` with descriptive tooltips to disabled buttons.
