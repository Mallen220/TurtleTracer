// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";

// We need to mock the stores first before importing the component
vi.mock("../../../stores", () => {
  return {
    showUpdateAvailableDialog: {
      subscribe: vi.fn((fn) => {
        fn(true);
        return () => {};
      }),
      set: vi.fn(),
    },
    updateDataStore: {
      subscribe: vi.fn((fn) => {
        fn({
          version: "1.2.3",
          releaseNotes: "Some cool updates",
          url: "http://example.com",
        });
        return () => {};
      }),
    },
  };
});

import UpdateAvailableDialog from "./UpdateAvailableDialog.svelte";

describe("UpdateAvailableDialog", () => {
  it("renders when open is true", async () => {
    const { getByText } = render(UpdateAvailableDialog, {
      show: true,
    });

    // Test the text according to the component
    expect(getByText("New Version Available")).toBeInTheDocument();
  });
});
