import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import DialogHost from "../../lib/components/DialogHost.svelte";

describe("DialogHost", () => {
  it("renders correctly", () => {
    const { container } = render(DialogHost);
    expect(container).toBeTruthy();
  });
});
