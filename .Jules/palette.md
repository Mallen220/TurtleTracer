# Palette's Journal

## 2024-05-22 - Accessibility State Management

Learning: For multi-step actions (like delete -> confirm), simply changing text isn't enough for screen readers. Dynamic `aria-label` combined with `aria-live="polite"` ensures the state change is announced immediately without moving focus.
Action: Apply this pattern to other stateful buttons (e.g., save/unsaved states) where the label changes significance.

## 2024-10-24 - Keyboard Accessibility in Reusable Components

Learning: Copy-pasting components can propagate accessibility anti-patterns. Found `tabindex="-1"` on interactive elements in `RotateSection`, likely copied or residual, preventing keyboard access.
Action: Always verify tab navigation on new or refactored components, especially those that look identical to others. Ensure `aria-label` is present on all icon-only buttons.
