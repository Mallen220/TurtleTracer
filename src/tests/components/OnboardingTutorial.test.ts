// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import OnboardingTutorial from "../../lib/components/OnboardingTutorial.svelte";

describe("OnboardingTutorial", () => {
  it("renders correctly", () => {
    const { container } = render(OnboardingTutorial);
    expect(container).toBeTruthy();
  });
});
