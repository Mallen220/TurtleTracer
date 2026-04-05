import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import KeyboardShortcuts from "../../lib/components/KeyboardShortcuts.svelte";

describe("KeyboardShortcuts", () => {
  it("renders correctly", () => {
    const { container } = render(KeyboardShortcuts);
    expect(container).toBeTruthy();
  });
});
