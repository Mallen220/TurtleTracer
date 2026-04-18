import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/svelte";
import ExportCodeDialog from "./ExportCodeDialog.svelte";

vi.mock("../../../utils/codeExport/index", () => ({
  generateCode: vi.fn(() => "export code"),
}));

vi.mock("../../../stores", async () => {
  const svelteStore = await import("svelte/store");
  return {
    notification: { show: vi.fn() },
    currentFilePath: svelteStore.writable(null),
  };
});

vi.mock("../../projectStore", async () => {
  const svelteStore = await import("svelte/store");
  const defaults = await import("../../../config/defaults");
  return {
    settingsStore: svelteStore.writable(defaults.DEFAULT_SETTINGS),
  };
});

describe("ExportCodeDialog", () => {
  it("renders when isOpen is true", () => {
    const { getByRole } = render(ExportCodeDialog, {
      isOpen: true,
      sequence: [],
      lines: [],
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 },
      shapes: [],
    });

    expect(getByRole("dialog")).toBeInTheDocument();
  });
});
