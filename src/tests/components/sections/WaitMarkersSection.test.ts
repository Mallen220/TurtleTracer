import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import WaitMarkersSection from "../../../lib/components/sections/WaitMarkersSection.svelte";

describe("WaitMarkersSection", () => {
  it("renders correctly", () => {
    const { container } = render(WaitMarkersSection, {
      props: {
        wait: {
          type: "wait",
          id: "1",
          time: 0,
          eventMarkers: [],
        },
      },
    });
    expect(container).toBeTruthy();
  });
});
