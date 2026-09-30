// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scaleLinear } from "d3";
import RobotOverlay from "../lib/components/renderer/RobotOverlay.svelte";
import { DEFAULT_SETTINGS } from "../config/defaults";
import type { Settings } from "../types";

// Two screen pixels per inch, so a 16 inch robot is 32 px wide.
const x = scaleLinear().domain([0, 144]).range([0, 288]);
const y = scaleLinear().domain([0, 144]).range([288, 0]);

const settings = (over: Partial<Settings> = {}): Settings =>
  ({
    ...DEFAULT_SETTINGS,
    rLength: 16,
    rWidth: 10,
    robotImage: "none",
    showRobotArrows: false,
    showFakeHeadingArrow: false,
    robotFeatures: [],
    ...over,
  }) as Settings;

function mount(
  props: Record<string, unknown> = {},
  over: Partial<Settings> = {},
) {
  return render(RobotOverlay, {
    x,
    y,
    ppI: 2,
    robotXY: { x: 20, y: 30 },
    robotHeading: 45,
    settings: settings(over),
    ...props,
  } as any);
}

const styleOf = (el: Element | null) =>
  (el as HTMLElement).getAttribute("style") ?? "";
const px = (style: string, prop: string) =>
  Number(new RegExp(`${prop}:\\s*(-?[\\d.]+)px`).exec(style)?.[1]);

describe("which robot is drawn", () => {
  it("draws nothing without a position", () => {
    const { container } = mount({ robotXY: null });
    expect(container.querySelector("[style*='z-index: 20']")).toBeNull();
  });

  it("draws nothing when the robot is hidden", () => {
    const { container } = mount({ robotXY: { x: 1, y: 1 }, showRobot: false });
    expect(container.querySelector("[style*='z-index: 20']")).toBeNull();
  });

  it("places the robot at its position, sized to the robot and turned to its heading", () => {
    const { container } = mount();
    const box = container.querySelector("[style*='z-index: 20']")!;
    const style = styleOf(box);
    expect(px(style, "left")).toBe(40); // 20 inches
    expect(px(style, "top")).toBe(288 - 60); // 30 inches, y pointing down
    expect(px(style, "width")).toBe(32); // 16 inches
    expect(px(style, "height")).toBe(20); // 10 inches
    expect(style).toContain("rotate(45deg)");
  });

  it("falls back to the default robot size when none is set", () => {
    const { container } = mount({}, { rLength: 0, rWidth: 0 });
    expect(
      px(styleOf(container.querySelector("[style*='z-index: 20']")), "width"),
    ).toBe(32);
  });

  it("shows two boxes, current and committed, when comparing versions", () => {
    const { container } = mount({
      isDiffMode: true,
      committedRobotState: { x: 50, y: 60, heading: 10 },
    });
    const boxes = [...container.querySelectorAll("[style*='z-index: 20']")];
    expect(boxes).toHaveLength(2);
    expect(styleOf(boxes[0])).toContain("rgba(34, 197, 94");
    expect(styleOf(boxes[1])).toContain("rgba(239, 68, 68");
    expect(px(styleOf(boxes[1]), "left")).toBe(100);
    expect(styleOf(boxes[1])).toContain("rotate(10deg)");
  });

  it("shows only the current box in diff mode if nothing was committed", () => {
    const { container } = mount({
      isDiffMode: true,
      committedRobotState: null,
    });
    expect(container.querySelectorAll("[style*='z-index: 20']")).toHaveLength(
      1,
    );
    const none = mount({
      isDiffMode: true,
      robotXY: null,
      committedRobotState: null,
    });
    expect(
      none.container.querySelectorAll("[style*='z-index: 20']"),
    ).toHaveLength(0);
  });
});

describe("a robot image", () => {
  it("shows the chosen image", () => {
    mount({}, { robotImage: "/mine.png" });
    expect(screen.getByAltText("Robot")).toHaveAttribute("src", "/mine.png");
  });

  it("falls back to the standard image if the chosen one fails to load", async () => {
    mount({}, { robotImage: "/broken.png" });
    const img = screen.getByAltText("Robot");
    await fireEvent.error(img);
    expect(img).toHaveAttribute("src", "/robot.png");
  });

  it("draws a heading arrow on a custom image only when that is turned on", () => {
    const off = mount(
      {},
      { robotImage: "/mine.png", showFakeHeadingArrow: false },
    );
    expect(off.container.querySelector("[style*='; color:']")).toBeNull();
    off.unmount();

    const on = mount(
      {},
      {
        robotImage: "/mine.png",
        showFakeHeadingArrow: true,
        fakeHeadingArrowColor: "#ff00ff",
      },
    );
    expect(
      styleOf(on.container.querySelector("[style*='; color:']")),
    ).toContain("rgb(255, 0, 255)");
    on.unmount();

    // The standard image already shows its heading.
    const standard = mount(
      {},
      { robotImage: "/robot.png", showFakeHeadingArrow: true },
    );
    expect(standard.container.querySelector("[style*='; color:']")).toBeNull();
  });

  it("uses the configured arrow colour, or white if it has been cleared", () => {
    const configured = mount(
      {},
      { robotImage: "/mine.png", showFakeHeadingArrow: true },
    );
    expect(
      styleOf(configured.container.querySelector("[style*='; color:']")),
    ).toContain(
      "rgb(239, 68, 68)", // the default, red
    );
    configured.unmount();

    const cleared = mount(
      {},
      {
        robotImage: "/mine.png",
        showFakeHeadingArrow: true,
        fakeHeadingArrowColor: "",
      },
    );
    expect(
      styleOf(cleared.container.querySelector("[style*='; color:']")),
    ).toContain("rgb(255, 255, 255)");
  });
});

describe("wheel arrows on the plain robot", () => {
  const arrows = (container: HTMLElement) =>
    [...container.querySelectorAll("svg.text-green-600")] as SVGElement[];

  it("are only shown when switched on", () => {
    expect(
      arrows(mount({}, { showRobotArrows: false }).container),
    ).toHaveLength(0);
    expect(arrows(mount({}, { showRobotArrows: true }).container)).toHaveLength(
      4,
    );
  });

  it("point forward or backward with each mecanum wheel's speed, and dim when it's stopped", () => {
    const { container } = mount(
      {
        mecanumSpeeds: {
          frontLeft: 0.5,
          frontRight: -0.5,
          backLeft: 0.01,
          backRight: 1,
        },
      },
      { showRobotArrows: true, robotDriveType: "holonomic" },
    );
    const [fl, fr, bl, br] = arrows(container);
    expect(styleOf(fl)).toContain("rotate(90deg)");
    expect(styleOf(fr)).toContain("rotate(270deg)");
    expect(styleOf(bl)).toContain("rotate(90deg)");
    // Faster wheels get bigger arrows.
    expect(Number(br.getAttribute("width"))).toBeGreaterThan(
      Number(fl.getAttribute("width")),
    );
    // Wrapper opacity: moving 0.8, nearly stopped 0.2.
    expect(styleOf(fl.parentElement)).toContain("opacity: 0.8");
    expect(styleOf(bl.parentElement)).toContain("opacity: 0.2");
  });

  it("are positioned at the robot's corners", () => {
    const { container } = mount({}, { showRobotArrows: true });
    const corners = arrows(container).map((a) =>
      styleOf(a.parentElement).replaceAll(/\s+/g, " "),
    );
    expect(corners[0]).toMatch(/top: 4px;\s*left: 4px/);
    expect(corners[1]).toMatch(/top: 4px;\s*right: 4px/);
    expect(corners[2]).toMatch(/bottom: 4px;\s*left: 4px/);
    expect(corners[3]).toMatch(/bottom: 4px;\s*right: 4px/);
  });

  it("turn to the swerve module angle at a fixed size and brightness", () => {
    const { container } = mount(
      {
        mecanumSpeeds: {
          frontLeft: 30,
          frontRight: 0,
          backLeft: 0,
          backRight: 0,
        },
      },
      { showRobotArrows: true, robotDriveType: "swerve" },
    );
    const [first] = arrows(container);
    expect(styleOf(first)).toContain("rotate(30deg)");
    expect(first.getAttribute("width")).toBe("15");
    expect(styleOf(first.parentElement)).toContain("opacity: 0.8");
  });

  it("rest when there are no wheel speeds", () => {
    const { container } = mount(
      { mecanumSpeeds: null },
      { showRobotArrows: true },
    );
    expect(styleOf(arrows(container)[0])).toContain("rotate(90deg)");
    expect(styleOf(arrows(container)[0].parentElement)).toContain(
      "opacity: 0.2",
    );
  });
});

describe("robot features", () => {
  const svgOf = (container: HTMLElement) =>
    container.querySelector("svg.overflow-visible");

  it("draws nothing without features", () => {
    expect(svgOf(mount().container)).toBeNull();
  });

  it("draws rectangles, circles and lines at their positions and sizes", () => {
    const { container } = mount(
      {},
      {
        robotFeatures: [
          {
            type: "rectangle",
            x: 1,
            y: 2,
            width: 6,
            height: 4,
            color: "#111111",
            filled: true,
          },
          {
            type: "circle",
            x: 0,
            y: 0,
            radius: 3,
            color: "#222222",
            filled: false,
          },
          {
            type: "line",
            x: 0,
            y: 0,
            angle: 0,
            length: 5,
            thickness: 2,
            color: "#333333",
          },
        ] as any,
      },
    );
    const svg = svgOf(container)!;
    // The box is 32 x 20 px, so the robot's centre is (16, 10) and 1 inch is 2 px.
    const rect = svg.querySelector("rect")!;
    expect(rect.getAttribute("width")).toBe("12");
    expect(rect.getAttribute("height")).toBe("8");
    expect(rect.getAttribute("x")).toBe(String(16 + 2 - 6));
    expect(rect.getAttribute("fill")).toBe("#111111");

    const circle = svg.querySelector("circle")!;
    expect(circle.getAttribute("r")).toBe("6");
    expect(circle.getAttribute("fill")).toBe("transparent");
    expect(circle.getAttribute("stroke")).toBe("#222222");

    const line = svg.querySelector("line")!;
    expect(Number(line.getAttribute("x2"))).toBeCloseTo(16 + 10);
    expect(Number(line.getAttribute("y2"))).toBeCloseTo(10); // the box is 20 px tall
    expect(line.getAttribute("stroke-width")).toBe("4");
  });

  it("uses default sizes when none are given", () => {
    const { container } = mount(
      {},
      {
        robotFeatures: [
          { type: "rectangle", x: 0, y: 0, color: "#000", filled: true },
          { type: "circle", x: 0, y: 0, color: "#000", filled: true },
          { type: "line", x: 0, y: 0, color: "#000" },
        ] as any,
      },
    );
    const svg = svgOf(container)!;
    expect(svg.querySelector("rect")!.getAttribute("width")).toBe("8"); // 4 in
    expect(svg.querySelector("circle")!.getAttribute("r")).toBe("4"); // 2 in
    expect(Number(svg.querySelector("line")!.getAttribute("x2"))).toBeCloseTo(
      16 + 12,
    ); // 6 in
    expect(svg.querySelector("line")!.getAttribute("stroke-width")).toBe("2");
  });

  it("skips features that are turned off", () => {
    const { container } = mount(
      {},
      {
        robotFeatures: [
          {
            type: "circle",
            x: 0,
            y: 0,
            radius: 1,
            color: "#000",
            visible: false,
          },
          { type: "circle", x: 0, y: 0, radius: 1, color: "#000" },
        ] as any,
      },
    );
    expect(svgOf(container)!.querySelectorAll("circle")).toHaveLength(1);
  });

  it("draws them on image robots too", () => {
    const { container } = mount(
      {},
      {
        robotImage: "/mine.png",
        robotFeatures: [
          { type: "circle", x: 0, y: 0, radius: 1, color: "#000" },
        ] as any,
      },
    );
    expect(svgOf(container)!.querySelector("circle")).not.toBeNull();
  });
});

describe("the turtle robot", () => {
  let frames: FrameRequestCallback[];
  let clock: number;

  beforeEach(() => {
    frames = [];
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const tick = async (ms: number) => {
    clock += ms;
    const pending = frames.splice(0);
    pending.forEach((cb) => cb(clock));
    await new Promise((r) => setTimeout(r, 0));
  };
  const tailAngle = () =>
    Number(
      /rotate\((-?[\d.]+)deg\)/.exec(styleOf(screen.getByAltText("Tail")))?.[1],
    );
  const frontLeftAngle = () =>
    Number(
      /rotate\((-?[\d.]+)deg\)/.exec(
        styleOf(screen.getByAltText("Front Left").parentElement),
      )?.[1],
    );

  it("draws the body and all four legs and the tail", () => {
    mount({}, { robotImage: "turtle" });
    for (const part of [
      "Tail",
      "Back Left",
      "Back Right",
      "Front Left",
      "Front Right",
      "Body",
    ]) {
      expect(screen.getByAltText(part)).toBeInTheDocument();
    }
  });

  it("swims its legs when driving, faster wheels moving their legs more", async () => {
    mount(
      {
        isPlaying: true,
        mecanumSpeeds: {
          frontLeft: 0,
          frontRight: 1,
          backLeft: 1,
          backRight: 1,
        },
      },
      { robotImage: "turtle" },
    );
    expect(tailAngle()).toBe(0);
    await tick(100);
    await tick(100);
    await tick(100);
    expect(Math.abs(tailAngle())).toBeGreaterThan(0);
    // The front left leg follows the front RIGHT wheel, which is running.
    expect(Math.abs(frontLeftAngle())).toBeGreaterThan(0);
  });

  it("holds still when paused, or when the wheels are stopped", async () => {
    mount(
      {
        isPlaying: false,
        mecanumSpeeds: {
          frontLeft: 1,
          frontRight: 1,
          backLeft: 1,
          backRight: 1,
        },
      },
      { robotImage: "turtle" },
    );
    await tick(200);
    await tick(200);
    expect(tailAngle()).toBe(0);
  });

  it("stops asking for frames when it goes away", () => {
    const { unmount } = mount({}, { robotImage: "turtle" });
    unmount();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});

describe("the timeline hover ghost", () => {
  const hover = { hoverRobotXY: { x: 60, y: 70 }, hoverRobotHeading: 90 };

  it("shows a faded copy of a custom robot image at the hovered moment", () => {
    mount(hover, { robotImage: "/mine.png" });
    const ghost = screen.getByAltText("Hover Ghost Robot");
    expect(ghost.parentElement!.getAttribute("style")).toContain(
      "opacity: 0.5",
    );
    expect(px(styleOf(ghost.parentElement), "left")).toBe(120);
    expect(styleOf(ghost.parentElement)).toContain("rotate(90deg)");
  });

  it("shows a dashed outline with an arrow for the plain and turtle robots", () => {
    for (const robotImage of ["none", "turtle"]) {
      const { container, unmount } = mount(hover, { robotImage });
      const ghost = container.querySelector(
        "[style*='dashed rgb(148, 163, 184)']",
      )!;
      expect(ghost).not.toBeNull();
      expect(styleOf(ghost)).toContain("rotate(90deg)");
      expect(styleOf(ghost.querySelector(".w-0"))).toContain(
        "border-left: 12px solid #94a3b8",
      );
      unmount();
    }
  });

  it("isn't shown without a hover heading, or when the robot is hidden", () => {
    const noHeading = mount(
      { hoverRobotXY: { x: 1, y: 1 }, hoverRobotHeading: null },
      { robotImage: "/mine.png" },
    );
    expect(screen.queryByAltText("Hover Ghost Robot")).toBeNull();
    noHeading.unmount();
    mount({ ...hover, showRobot: false }, { robotImage: "/mine.png" });
    expect(screen.queryByAltText("Hover Ghost Robot")).toBeNull();
  });

  it("a heading of zero still counts as a heading", () => {
    mount(
      { hoverRobotXY: { x: 1, y: 1 }, hoverRobotHeading: 0 },
      { robotImage: "/mine.png" },
    );
    expect(screen.getByAltText("Hover Ghost Robot")).toBeInTheDocument();
  });

  it("draws the heading arrow on a custom image only when turned on", () => {
    const { container } = mount(hover, {
      robotImage: "/mine.png",
      showFakeHeadingArrow: true,
    });
    expect(
      container.querySelector("[style*='border-left: 10px solid #16a34a']"),
    ).not.toBeNull();
  });
});

describe("the telemetry ghost", () => {
  const ghost = { ghostRobotState: { x: 25, y: 35, heading: 120 } };

  it("shows where the robot really was, behind the planned robot", () => {
    const { container } = mount(ghost);
    const box = container.querySelector("[style*='z-index: 19']")!;
    expect(px(styleOf(box), "left")).toBe(50);
    expect(styleOf(box)).toContain("rotate(120deg)");
    expect(styleOf(box)).toContain("dashed rgb(107, 114, 128)");
    expect(
      box.querySelector("[style*='rgba(107, 114, 128, 0.3)']"),
    ).not.toBeNull();
  });

  it("is drawn as a grey turtle for the turtle robot", () => {
    mount(ghost, { robotImage: "turtle" });
    expect(screen.getByAltText("Ghost Body")).toBeInTheDocument();
    expect(screen.getByAltText("Ghost Tail")).toBeInTheDocument();
  });

  it("uses the robot image, with the standard one as a fallback", async () => {
    mount(ghost, { robotImage: "/mine.png" });
    const img = screen.getByAltText("Ghost Robot");
    expect(img).toHaveAttribute("src", "/mine.png");
    await fireEvent.error(img);
    expect(img).toHaveAttribute("src", "/robot.png");
  });

  it("gets a faded heading arrow when that's turned on", () => {
    const { container } = mount(ghost, {
      robotImage: "/mine.png",
      showFakeHeadingArrow: true,
    });
    expect(
      container.querySelector("[style*='opacity: 0.5'][style*='; color:']"),
    ).not.toBeNull();
  });

  it("isn't there when there is no telemetry", () => {
    const { container } = mount({ ghostRobotState: null });
    expect(container.querySelector("[style*='z-index: 19']")).toBeNull();
  });
});
