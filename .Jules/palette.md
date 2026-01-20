# Palette's Journal

## 2024-05-22 - Accessibility State Management

Learning: For multi-step actions (like delete -> confirm), simply changing text isn't enough for screen readers. Dynamic `aria-label` combined with `aria-live="polite"` ensures the state change is announced immediately without moving focus.
Action: Apply this pattern to other stateful buttons (e.g., save/unsaved states) where the label changes significance.

## 2024-10-24 - Keyboard Accessibility in Reusable Components

Learning: Copy-pasting components can propagate accessibility anti-patterns. Found `tabindex="-1"` on interactive elements in `RotateSection`, likely copied or residual, preventing keyboard access.
Action: Always verify tab navigation on new or refactored components, especially those that look identical to others. Ensure `aria-label` is present on all icon-only buttons.

## 2026-01-19 - Keyboard Visibility in Hover-Revealed UI

Learning: Using `opacity-0` with `group-hover:opacity-100` makes controls invisible to keyboard users who tab into them. This creates "ghost" focus stops where the user knows they are somewhere but can't see the control.
Action: Always pair `group-hover` visibility with `group-focus-within` (or `focus-within`) to ensure keyboard users can see what they are interacting with.

## 2026-01-20 - Empty States and User Onboarding

Learning: Applications often rely on "default content" (like a sample path) to avoid empty states, but this can mask the need for proper guidance when the user deletes everything. A dedicated `EmptyState` component with a clear call-to-action provides better guidance than leaving the user with a blank canvas or generic "Add" buttons.
Action: Implement a reusable `EmptyState` component and verify the "zero data" state by temporarily disabling default content during testing.
