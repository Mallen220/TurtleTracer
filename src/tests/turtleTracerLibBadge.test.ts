// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Sections whose features need TurtleTracerLib on the robot say so in their header.
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import SectionHeader from "../lib/components/common/SectionHeader.svelte";

const badge = () =>
  screen.queryByRole("link", { name: /Requires TurtleTracerLib/ });

describe("section header", () => {
  it("has no TurtleTracerLib note by default", () => {
    render(SectionHeader, { title: "Obstacles" });
    expect(badge()).toBeNull();
  });

  it("notes a section that needs TurtleTracerLib, readable from the keyboard", () => {
    render(SectionHeader, {
      title: "Event Markers",
      usesTurtleTracerLib: true,
    });
    const note = badge()!;
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent("Requires TurtleTracerLib");
    // It opens the library's docs.
    expect(note).toHaveAttribute(
      "href",
      "https://www.turtletracer.com/turtle-tracer-lib/",
    );
    expect(note).toHaveAttribute("target", "_blank");
  });

  it("keeps the note out of the collapse button", async () => {
    render(SectionHeader, {
      title: "Event Markers",
      usesTurtleTracerLib: true,
    });
    const toggle = screen.getByRole("button", { name: "Hide Event Markers" });
    expect(toggle).not.toContainElement(badge());
    await fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Show Event Markers" }),
    ).toBeInTheDocument();
  });

  it("links to the feature's own docs page when given one", () => {
    render(SectionHeader, {
      title: "Event Markers",
      usesTurtleTracerLib:
        "https://www.turtletracer.com/turtle-tracer-lib/named-commands/",
    });
    expect(badge()).toHaveAttribute(
      "href",
      "https://www.turtletracer.com/turtle-tracer-lib/named-commands/",
    );
  });
});
