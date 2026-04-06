// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import LeftSidebar from "../../lib/components/LeftSidebar.svelte";

import { settingsStore } from "../../lib/projectStore";

describe("LeftSidebar", () => {
  it("renders correctly", () => {
    settingsStore.set({} as any);
    const { container } = render(LeftSidebar, { props: { settings: {} } });
    expect(container).toBeTruthy();
  });
});
