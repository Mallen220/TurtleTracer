import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import SetupDialog from "./SetupDialog.svelte";

vi.mock("../../../utils/directorySettings", () => ({
  saveAutoPathsDirectory: vi.fn(),
}));

describe("SetupDialog", () => {
  afterEach(() => {
    // Teardown the global mutation to avoid leaking test state
    if ((globalThis as any).electronAPI) {
      delete (globalThis as any).electronAPI;
    }
  });

  it("renders when show is true", () => {
    const { getByRole } = render(SetupDialog, {
      show: true,
    });

    expect(getByRole("dialog")).toBeInTheDocument();
  });

  it("calls electron API when select directory button clicked", async () => {
    const mockSetDirectory = vi.fn().mockResolvedValue("some-path");
    (globalThis as any).electronAPI = {
      setDirectory: mockSetDirectory,
    };

    const { getByText } = render(SetupDialog, {
      show: true,
    });

    const button = getByText(/Select Directory/i);
    await fireEvent.click(button);
    expect(mockSetDirectory).toHaveBeenCalled();
  });
});
