// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trackMicrosoftStoreInstall } from "./msStoreTracking";

const isWindowsStore = vi.fn();
const fetchMock = vi.fn();

describe("trackMicrosoftStoreInstall", () => {
  beforeEach(() => {
    localStorage.clear();
    isWindowsStore.mockReset().mockResolvedValue(true);
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    vi.stubGlobal("electronAPI", { isWindowsStore });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloads the tracker asset once and remembers it", async () => {
    await trackMicrosoftStoreInstall();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/releases/download/tracker/"),
    );
    expect(localStorage.getItem("msStoreTracked")).toBe("true");

    await trackMicrosoftStoreInstall();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does nothing outside the Store build", async () => {
    isWindowsStore.mockResolvedValue(false);
    await trackMicrosoftStoreInstall();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when the desktop API can't tell (browser, older builds)", async () => {
    vi.stubGlobal("electronAPI", {});
    await trackMicrosoftStoreInstall();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("tries again next launch if the download fails", async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await trackMicrosoftStoreInstall();
    expect(localStorage.getItem("msStoreTracked")).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("swallows network errors", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(trackMicrosoftStoreInstall()).resolves.toBeUndefined();
    expect(localStorage.getItem("msStoreTracked")).toBeNull();
  });

  it("swallows errors from the desktop API", async () => {
    isWindowsStore.mockRejectedValue(new Error("ipc"));
    await expect(trackMicrosoftStoreInstall()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
