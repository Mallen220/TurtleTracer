// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";

// The dialogs read their webhook address when they load.
vi.stubEnv("VITE_DISCORD_ISSUES", "https://discord.test/issues");
vi.stubEnv("VITE_DISCORD_RATINGS", "https://discord.test/ratings");

vi.mock("../utils/settingsPersistence", () => ({
  saveSettings: vi.fn(async () => {}),
}));

const { default: FeedbackDialog } =
  await import("../lib/components/dialogs/FeedbackDialog.svelte");
const { default: RatingDialog } =
  await import("../lib/components/dialogs/RatingDialog.svelte");
const { showFeedbackDialog, showRatingDialog, ratingDialogAutoOpened } =
  await import("../stores");
const { settingsStore } = await import("../lib/projectStore");
const { DEFAULT_SETTINGS } = await import("../config/defaults");
const { default: pkg } = await import("../../package.json");

const fetchMock = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal("fetch", fetchMock);
  settingsStore.set({ ...DEFAULT_SETTINGS });
  showFeedbackDialog.set(false);
  showRatingDialog.set(false);
  ratingDialogAutoOpened.set(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe("FeedbackDialog", () => {
  const open = () => {
    showFeedbackDialog.set(true);
    render(FeedbackDialog);
  };
  const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));
  const describeIt = (text: string) =>
    fireEvent.input(screen.getByLabelText(/Describe the issue/), {
      target: { value: text },
    });

  it("asks for a description before sending anything", async () => {
    open();
    await submit();
    expect(screen.getByText("Please enter a description.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the description and version to the webhook, then thanks the user", async () => {
    open();
    await describeIt("The ruler is off by one");
    await submit();

    await waitFor(() =>
      expect(screen.getByText(/Feedback sent successfully/)).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.test/issues");
    const embed = sentBody().embeds[0];
    expect(embed.description).toBe("The ruler is off by one");
    expect(embed.fields).toEqual([
      { name: "Version", value: `v${pkg.version}`, inline: true },
    ]);
  });

  it("adds contact info only when given", async () => {
    open();
    await describeIt("Something");
    await fireEvent.input(screen.getByLabelText(/Optional Contact Info/), {
      target: { value: "  me@example.com " },
    });
    await submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().embeds[0].fields.at(-1)).toEqual({
      name: "Contact Info",
      value: "me@example.com",
      inline: true,
    });
  });

  it("remembers when it was sent, to limit how often it can be sent", async () => {
    open();
    await describeIt("Something");
    await submit();
    await waitFor(() =>
      expect(get(settingsStore).lastFeedbackSubmit).toBeTruthy(),
    );
  });

  it("shows the webhook's refusal", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    open();
    await describeIt("Something");
    await submit();
    await waitFor(() =>
      expect(screen.getByText("Failed to send: 500")).toBeTruthy(),
    );
    expect(get(settingsStore).lastFeedbackSubmit).toBeFalsy();
  });

  it("shows a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    open();
    await describeIt("Something");
    await submit();
    await waitFor(() => expect(screen.getByText("offline")).toBeTruthy());
  });

  it("closes on Escape, but not while sending", async () => {
    let finish: (value: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    open();
    await describeIt("Something");
    await submit();
    await waitFor(() => expect(screen.getByText("Submitting...")).toBeTruthy());

    await fireEvent.keyDown(document, { key: "Escape" });
    expect(get(showFeedbackDialog)).toBe(true);

    finish({ ok: true, status: 200 });
    await waitFor(() =>
      expect(screen.getByText(/Feedback sent successfully/)).toBeTruthy(),
    );
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(get(showFeedbackDialog)).toBe(false);
  });

  it("closes itself shortly after a successful send", async () => {
    open();
    await describeIt("Something");
    await submit();
    await waitFor(() =>
      expect(screen.getByText(/Feedback sent successfully/)).toBeTruthy(),
    );
    await vi.advanceTimersByTimeAsync(2000);
    expect(get(showFeedbackDialog)).toBe(false);
  });

  it("closes when the backdrop is clicked, but not the dialog itself", async () => {
    open();
    await fireEvent.click(screen.getByRole("dialog"));
    expect(get(showFeedbackDialog)).toBe(true);
    await fireEvent.click(screen.getByRole("presentation"));
    expect(get(showFeedbackDialog)).toBe(false);
  });

  it("makes the user wait out the cooldown after sending", async () => {
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      lastFeedbackSubmit: Date.now().toString(),
    });
    open();
    const button = await screen.findByRole("button", { name: /Wait \d+m/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("RatingDialog", () => {
  const open = () => {
    showRatingDialog.set(true);
    render(RatingDialog);
  };
  const submit = () =>
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));
  const rate = (stars: number) =>
    fireEvent.click(screen.getByLabelText(`${stars} star rating`));

  it("asks for a rating before sending anything", async () => {
    open();
    await submit();
    expect(screen.getByText("Please select a rating.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the stars, colour-coded, and remembers this version was rated", async () => {
    open();
    await rate(5);
    await submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("https://discord.test/ratings");
    const embed = sentBody().embeds[0];
    expect(embed.color).toBe(65280);
    expect(embed.fields).toEqual([
      { name: "Rating", value: "Stars: 5 / 5", inline: true },
      { name: "Version", value: `v${pkg.version}`, inline: true },
    ]);
    expect(get(settingsStore).submittedRatings).toEqual({
      [pkg.version]: true,
    });
  });

  it.each([
    [1, 16711680],
    [2, 16711680],
    [3, 16753920],
    [4, 65280],
  ])("colours a %i star rating %i", async (stars, color) => {
    open();
    await rate(stars);
    await submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody().embeds[0].color).toBe(color);
  });

  it("includes written feedback, shortened if very long", async () => {
    open();
    await rate(3);
    await fireEvent.input(screen.getByLabelText(/What could we improve/), {
      target: { value: "x".repeat(1200) },
    });
    await submit();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const field = sentBody().embeds[0].fields.at(-1);
    expect(field.name).toBe("Additional Feedback");
    expect(field.value).toBe("x".repeat(1000) + "...");
  });

  it("shows the webhook's refusal and doesn't mark the version as rated", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    open();
    await rate(4);
    await submit();
    await waitFor(() =>
      expect(screen.getByText("Failed to send: 429")).toBeTruthy(),
    );
    expect(get(settingsStore).submittedRatings ?? {}).toEqual({});
  });

  it("closes on Escape", async () => {
    open();
    await fireEvent.keyDown(document, { key: "Escape" });
    expect(get(showRatingDialog)).toBe(false);
  });

  it("closing an automatic prompt means it isn't shown again for this version", async () => {
    ratingDialogAutoOpened.set(true);
    open();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(get(settingsStore).dismissedRatings).toEqual({
      [pkg.version]: true,
    });
    expect(get(ratingDialogAutoOpened)).toBe(false);
  });

  it("'Never ask again' dismisses it for good", async () => {
    ratingDialogAutoOpened.set(true);
    open();
    await fireEvent.click(
      screen.getByRole("button", { name: "Never ask again" }),
    );
    expect(get(settingsStore).dismissedRatings?.all).toBe(true);
    expect(get(showRatingDialog)).toBe(false);
  });

  it("doesn't open for a version that has been rated", async () => {
    settingsStore.set({
      ...DEFAULT_SETTINGS,
      submittedRatings: { [pkg.version]: true },
    });
    open();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(get(showRatingDialog)).toBe(false));
  });
});
