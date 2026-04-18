import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import RatingDialog from "./RatingDialog.svelte";

vi.mock("../../../stores", () => ({
  showRatingDialog: {
    subscribe: vi.fn((fn) => {
      fn(true);
      return () => {};
    }),
    set: vi.fn(),
  },
  showFeedbackDialog: { set: vi.fn() },
  ratingDialogAutoOpened: {
    subscribe: vi.fn((fn) => {
      fn(false);
      return () => {};
    }),
  },
}));

vi.mock("../../projectStore", () => ({
  settingsStore: {
    subscribe: vi.fn((fn) => {
      fn({});
      return () => {};
    }),
  },
}));

describe("RatingDialog", () => {
  it("renders when active", () => {
    const { getByText } = render(RatingDialog);

    expect(getByText("Enjoying Turtle Tracer?")).toBeInTheDocument();
  });
});
