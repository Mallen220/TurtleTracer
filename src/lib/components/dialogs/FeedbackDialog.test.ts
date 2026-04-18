import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import FeedbackDialog from "./FeedbackDialog.svelte";

vi.mock("../../../stores", () => ({
  showFeedbackDialog: {
    subscribe: vi.fn((fn) => {
      fn(true);
      return () => {};
    }),
    set: vi.fn(),
  },
  showRatingDialog: { set: vi.fn() },
  ratingDialogAutoOpened: { set: vi.fn() },
}));

vi.mock("../../projectStore", () => ({
  settingsStore: {
    subscribe: vi.fn((fn) => {
      fn({});
      return () => {};
    }),
  },
}));

describe("FeedbackDialog", () => {
  it("renders when store is true", () => {
    const { getByText } = render(FeedbackDialog);

    expect(getByText("Report Issue / Feedback / Features")).toBeInTheDocument();
  });
});
