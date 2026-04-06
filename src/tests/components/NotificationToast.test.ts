// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import NotificationToast from "../../lib/components/NotificationToast.svelte";

describe("NotificationToast", () => {
  it("renders correctly", () => {
    const { container } = render(NotificationToast);
    expect(container).toBeTruthy();
  });
});
