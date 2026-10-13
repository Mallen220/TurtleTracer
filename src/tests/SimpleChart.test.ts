// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import SimpleChart from "../lib/components/tools/SimpleChart.svelte";

describe("SimpleChart tooltip behavior", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 480,
    });
  });

  it("hides tooltip after pointer leaves chart overlay", async () => {
    const { container } = render(SimpleChart, {
      data: [
        { time: 0, value: 0 },
        { time: 0.07, value: 0 },
        { time: 0.2, value: 5 },
      ],
      label: "Centripetal Accel",
      unit: "in/s²",
      height: 150,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const overlay = container.querySelector("svg rect[fill='transparent']");
    expect(overlay).toBeTruthy();

    const tooltip = container.querySelector(".fixed");
    expect(tooltip).toBeTruthy();

    await fireEvent.mouseMove(overlay!, {
      clientX: 50,
      clientY: 40,
      pageX: 50,
      pageY: 40,
    });

    expect((tooltip as HTMLDivElement).style.opacity).toBe("1");

    await fireEvent.mouseLeave(overlay!);

    expect((tooltip as HTMLDivElement).style.opacity).toBe("0");
  });

  it("hides tooltip on scroll fallback", async () => {
    const { container } = render(SimpleChart, {
      data: [
        { time: 0, value: 0 },
        { time: 0.1, value: 2 },
      ],
      label: "Velocity",
      unit: "in/s",
      height: 150,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const overlay = container.querySelector("svg rect[fill='transparent']");
    const tooltip = container.querySelector(".fixed") as HTMLDivElement;

    expect(overlay).toBeTruthy();
    expect(tooltip).toBeTruthy();

    await fireEvent.mouseMove(overlay!, {
      clientX: 60,
      clientY: 50,
      pageX: 60,
      pageY: 50,
    });

    expect(tooltip.style.opacity).toBe("1");

    globalThis.dispatchEvent(new Event("scroll"));

    expect(tooltip.style.opacity).toBe("0");
  });
});

describe("SimpleChart seeking", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      value: 480,
    });
  });

  const data = [
    { time: 0, value: 0 },
    { time: 2, value: 5 },
    { time: 4, value: 1 },
  ];
  const pointer = (type: string, clientX: number) =>
    new MouseEvent(type, { clientX, bubbles: true });

  async function drawn(onSeek?: (time: number) => void) {
    const { container } = render(SimpleChart, {
      data,
      label: "Velocity",
      unit: "in/s",
      height: 150,
      onSeek,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return container.querySelector("svg rect[fill='transparent']")!;
  }

  it("reports the time under the pointer and follows a drag until it is released", async () => {
    const onSeek = vi.fn();
    const plot = await drawn(onSeek);

    plot.dispatchEvent(pointer("pointerdown", 100));
    plot.dispatchEvent(pointer("pointermove", 300));
    expect(onSeek).toHaveBeenCalledTimes(2);
    const [first, second] = onSeek.mock.calls.map(([time]) => time);
    expect(second).toBeGreaterThan(first);

    plot.dispatchEvent(pointer("pointerup", 300));
    plot.dispatchEvent(pointer("pointermove", 400));
    expect(onSeek).toHaveBeenCalledTimes(2);
  });

  it("stays inside the chart however far the pointer goes", async () => {
    const onSeek = vi.fn();
    const plot = await drawn(onSeek);

    plot.dispatchEvent(pointer("pointerdown", 100_000));
    plot.dispatchEvent(pointer("pointerup", 100_000));
    plot.dispatchEvent(pointer("pointerdown", -100_000));

    expect(onSeek.mock.calls.map(([time]) => time)).toEqual([4, 0]);
  });

  it("ignores clicks when it has nowhere to send them", async () => {
    const plot = await drawn();
    expect(() => plot.dispatchEvent(pointer("pointerdown", 100))).not.toThrow();
  });
});
