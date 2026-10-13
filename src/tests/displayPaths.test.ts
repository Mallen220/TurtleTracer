// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { displayPath, shortenPath, shortPathText } from "../utils/displayPaths";
import { messageParts, pathInMessage } from "../utils/messagePaths";
import PathText from "../lib/components/PathText.svelte";
import MessageText from "../lib/components/MessageText.svelte";
import NotificationToast from "../lib/components/NotificationToast.svelte";
import { notification } from "../stores";

const JAVA =
  "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/autos/Far.java";

describe("displayPath", () => {
  it("shows repository files from owner/repo", () => {
    expect(displayPath("/@github/team/robot/TeamCode/Far.turt")).toBe(
      "team/robot/TeamCode/Far.turt",
    );
  });

  it("shows the browser's files from /", () => {
    expect(displayPath("/browser_fs/AutoPaths/Far.turt")).toBe(
      "/AutoPaths/Far.turt",
    );
    expect(displayPath("/browser_fs")).toBe("/");
  });

  it("leaves other paths alone", () => {
    expect(displayPath("/Users/sam/Far.turt")).toBe("/Users/sam/Far.turt");
    expect(displayPath("../Macros/Intake.turt")).toBe("../Macros/Intake.turt");
  });
});

describe("shortenPath", () => {
  it("keeps the first folder and the last two names", () => {
    expect(shortPathText(JAVA)).toBe("TeamCode/…/autos/Far.java");
    expect(shortenPath(JAVA)).toEqual({
      start: "TeamCode/",
      end: "/autos/Far.java",
    });
  });

  it("keeps a relative path's .. and the folder after them", () => {
    expect(
      shortPathText(
        "../../java/org/firstinspires/ftc/teamcode/Commands/AutoCommands",
      ),
    ).toBe("../../java/…/Commands/AutoCommands");
  });

  it("keeps owner/repo for repository files", () => {
    expect(
      shortPathText(
        "/@github/team/robot/TeamCode/src/main/assets/AutoPaths/Far.turt",
      ),
    ).toBe("team/robot/…/AutoPaths/Far.turt");
  });

  it("shows a home folder as ~", () => {
    expect(
      shortPathText("/Users/sam/Documents/FTC/Robot/AutoPaths/Far.turt"),
    ).toBe("~/Documents/…/AutoPaths/Far.turt");
    expect(
      shortPathText(
        String.raw`C:\Users\Sam\Documents\FTC\Robot\AutoPaths\Far.turt`,
      ),
    ).toBe(String.raw`~\Documents\…\AutoPaths\Far.turt`);
    expect(shortPathText("/home/sam/a/b/c/d/e.turt")).toBe("~/a/…/d/e.turt");
  });

  it("keeps the root of other absolute paths", () => {
    expect(shortPathText("/Volumes/USB/FTC/Robot/AutoPaths/Far.turt")).toBe(
      "/Volumes/…/AutoPaths/Far.turt",
    );
  });

  it("keeps a trailing separator", () => {
    expect(shortPathText("TeamCode/src/main/assets/AutoPaths/")).toBe(
      "TeamCode/…/assets/AutoPaths/",
    );
  });

  it("shows short paths whole", () => {
    expect(shortenPath("Far.turt")).toBeNull();
    expect(shortenPath("/browser_fs/AutoPaths/Far.turt")).toBeNull();
    expect(shortPathText("/browser_fs/AutoPaths/Far.turt")).toBe(
      "/AutoPaths/Far.turt",
    );
    // Hiding one folder isn't worth it.
    expect(shortenPath("TeamCode/src/AutoPaths/Far.turt")).toBeNull();
    expect(shortenPath("../../../..")).toBeNull();
    expect(shortenPath("")).toBeNull();
  });

  it("leaves a home folder alone when it shows the whole path", () => {
    expect(shortPathText("/Users/sam/FTC/Far.turt")).toBe(
      "/Users/sam/FTC/Far.turt",
    );
  });
});

describe("paths in messages", () => {
  it("finds the marked paths", () => {
    const message = `Saved ${pathInMessage("/a/b.turt")} and ${pathInMessage("c")}`;
    expect(messageParts(message)).toEqual([
      { text: "Saved " },
      { path: "/a/b.turt" },
      { text: " and " },
      { path: "c" },
    ]);
  });

  it("keeps marks when built into another message", () => {
    const error = new Error(`File not found: ${pathInMessage(JAVA)}`);
    expect(messageParts(`Save failed: ${error.message}`)).toEqual([
      { text: "Save failed: File not found: " },
      { path: JAVA },
    ]);
  });

  it("leaves unmarked messages whole", () => {
    expect(messageParts("Saved")).toEqual([{ text: "Saved" }]);
    expect(messageParts("")).toEqual([]);
  });
});

describe("PathText", () => {
  it("shows the start and end, and the rest when asked", async () => {
    const { container } = render(PathText, { path: JAVA });
    expect(container.textContent).toBe("TeamCode/…/autos/Far.java");
    expect(container.querySelector("[title]")?.getAttribute("title")).toBe(
      JAVA,
    );

    await fireEvent.click(
      screen.getByRole("button", { name: "Show the full path" }),
    );
    expect(container.textContent).toBe(JAVA);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("starts shortened again for a different path", async () => {
    const { container, rerender } = render(PathText, { path: JAVA });
    await fireEvent.click(screen.getByRole("button"));
    await rerender({ path: "/@github/team/robot/" + JAVA });
    expect(container.textContent).toBe("team/robot/…/autos/Far.java");
  });

  it("shows short paths as they are, without the app's prefixes", () => {
    const { container } = render(PathText, {
      path: "/browser_fs/AutoPaths/Far.turt",
    });
    expect(container.textContent).toBe("/AutoPaths/Far.turt");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("doesn't pass the click on", async () => {
    // So a row or card holding the path doesn't treat it as its own click.
    let clicks = 0;
    const count = () => clicks++;
    render(PathText, { path: JAVA });
    document.body.addEventListener("click", count);
    await fireEvent.click(screen.getByRole("button"));
    document.body.removeEventListener("click", count);
    expect(clicks).toBe(0);
  });
});

describe("MessageText", () => {
  it("shortens the paths in a message and keeps the rest", () => {
    const { container } = render(MessageText, {
      message: `Far.java wasn't exported: ${pathInMessage(JAVA)} isn't compiled.`,
    });
    expect(container.textContent).toBe(
      "Far.java wasn't exported: TeamCode/…/autos/Far.java isn't compiled.",
    );
  });
});

describe("NotificationToast", () => {
  beforeEach(() => notification.set(null));

  it("shortens paths in notifications, and expands them on click", async () => {
    render(NotificationToast);
    notification.set({
      message: `Project saved to ${pathInMessage("/Users/sam/Documents/FTC/Robot/AutoPaths/Far.turt")}`,
      type: "success",
      timeout: 0,
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Project saved to ~/Documents/…/AutoPaths/Far.turt",
    );

    await fireEvent.click(
      screen.getByRole("button", { name: "Show the full path" }),
    );
    expect(alert.textContent).toContain(
      "Project saved to /Users/sam/Documents/FTC/Robot/AutoPaths/Far.turt",
    );
    // Expanding a path doesn't close the notification.
    expect(screen.getByRole("alert")).toBe(alert);
  });
});
