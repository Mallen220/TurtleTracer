// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  followJavaFile,
  followedJava,
  stopFollowing,
  syntaxProblem,
  confirmFollowedJavaEdit,
} from "../lib/javaFollow";
import {
  currentFilePath,
  isUnsaved,
  selectedLineId,
  selectedPointId,
} from "../stores";
import {
  linesStore,
  sequenceStore,
  startPointStore,
} from "../lib/projectStore";

const JAVA =
  "/team/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/Auto.java";

const auto = (endX: number) => `
  public class Auto extends OpMode {
    private final PoseFactory p = PoseFactory.degrees();
    public void init() {
      follower.setPose(p.of(10, 20, 0));
      Score = line(p.of(10, 20, 0), p.of(${endX}, 20, 0)).tangent();
    }
    public void loop() { follower.follow(Score); }
  }`;

/** The desktop app's API, with a Java file whose saves the test makes. */
function desktop(files: Record<string, string>) {
  let changed: ((path: string) => void) | null = null;
  const api = {
    readFile: vi.fn(async (path: string) => {
      if (!(path in files)) throw new Error("ENOENT");
      return files[path]!;
    }),
    fileExists: vi.fn(async (path: string) => path in files),
    chooseJavaFile: vi.fn(async () => JAVA),
    followJavaFile: vi.fn(async () => true),
    unfollowJavaFile: vi.fn(async () => true),
    onJavaFileChanged: vi.fn((callback: (path: string) => void) => {
      changed = callback;
      return () => (changed = null);
    }),
  };
  /** Saves the Java file "in the editor". */
  const save = async (source: string) => {
    files[JAVA] = source;
    changed?.(JAVA);
    await vi.waitFor(() => {
      const followed = get(followedJava);
      if (!followed) return;
      expect(api.readFile).toHaveBeenCalled();
    });
    await new Promise((r) => setTimeout(r, 20));
  };
  return { api, save, isWatching: () => changed !== null };
}

let env: ReturnType<typeof desktop>;

beforeEach(() => {
  env = desktop({ [JAVA]: auto(50) });
  (globalThis as { electronAPI?: unknown }).electronAPI = env.api;
  currentFilePath.set(null);
  isUnsaved.set(false);
});

afterEach(() => {
  stopFollowing({ editable: false });
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

const endX = () => get(linesStore)[0]?.endPoint.x;

describe("following a Java file", () => {
  it("shows its paths, locked, and no project file", async () => {
    expect(await followJavaFile()).toBe(true);
    expect(env.api.followJavaFile).toHaveBeenCalledWith(JAVA);
    expect(endX()).toBe(50);
    expect(get(linesStore).every((l) => l.locked)).toBe(true);
    expect(get(startPointStore)).toMatchObject({ x: 10, y: 20, locked: true });
    expect(get(sequenceStore)).toHaveLength(1);
    expect(get(currentFilePath)).toBeNull();
    expect(get(followedJava)).toMatchObject({
      name: "Auto.java",
      error: null,
      paths: 1,
    });
  });

  it("updates the field each time the file is saved", async () => {
    await followJavaFile();
    await env.save(auto(80));
    expect(endX()).toBe(80);
  });

  it("keeps the last version that worked while the code doesn't compile", async () => {
    await followJavaFile();
    await env.save(auto(80).replace("tangent();", "tangent()"));
    expect(endX()).toBe(50);
    expect(get(followedJava)?.error).toMatchObject({
      line: 6,
      message: "Expected ; but found }.",
    });

    await env.save(auto(90));
    expect(endX()).toBe(90);
    expect(get(followedJava)?.error).toBeNull();
  });

  it("says so when the file has no paths, and keeps showing the last ones", async () => {
    await followJavaFile();
    await env.save("class Auto {}");
    expect(endX()).toBe(50);
    expect(get(followedJava)?.error?.message).toBe(
      "No paths found in this file.",
    );
  });

  it("clears previous paths and selections when initially opening a file with no paths", async () => {
    env = desktop({ [JAVA]: "class EmptyAuto {}" });
    (globalThis as { electronAPI?: unknown }).electronAPI = env.api;
    selectedLineId.set("old-line-1");
    selectedPointId.set("point-1-0");

    expect(await followJavaFile()).toBe(true);
    expect(get(linesStore)).toHaveLength(0);
    expect(get(selectedLineId)).toBeNull();
    expect(get(selectedPointId)).toBeNull();
    expect(get(followedJava)?.error?.message).toBe(
      "No paths found in this file.",
    );
  });

  it("loads poses from the project file the code reads, where the library finds it", async () => {
    const project = {
      startPoint: { x: 1, y: 2, heading: "constant", degrees: 0 },
      lines: [
        {
          id: "x",
          name: "Score",
          endPoint: { x: 30, y: 40, heading: "tangential" },
          controlPoints: [],
          color: "#fff",
        },
      ],
      sequence: [{ kind: "path", lineId: "x" }],
      shapes: [],
    };
    env = desktop({
      [JAVA]: `
        public class Auto {
          public Auto(HardwareMap hw) {
            pp = new TurtleTracerReader("Far.turt", hw.appContext);
            startPoint = pp.get("startPoint");
            Score = pp.get("Score");
            startPointTOScore = line(startPoint, Score).tangent();
            follower.follow(startPointTOScore);
          }
        }`,
      "/team/TeamCode/src/main/assets/AutoPaths/Far.turt":
        JSON.stringify(project),
    });
    (globalThis as { electronAPI?: unknown }).electronAPI = env.api;
    await followJavaFile();
    expect(get(linesStore)[0]?.endPoint).toMatchObject({ x: 30, y: 40 });
    expect(get(followedJava)?.notes).toEqual([]);
  });

  it("ends when a project is opened", async () => {
    await followJavaFile();
    currentFilePath.set("/team/AutoPaths/Other.turt");
    expect(get(followedJava)).toBeNull();
    expect(env.api.unfollowJavaFile).toHaveBeenCalled();
    expect(env.isWatching()).toBe(false);
  });

  it("leaves the paths to edit, unsaved, when it's stopped", async () => {
    await followJavaFile();
    stopFollowing();
    expect(get(followedJava)).toBeNull();
    expect(get(linesStore).some((l) => l.locked)).toBe(false);
    expect(get(startPointStore).locked).toBe(false);
    expect(get(isUnsaved)).toBe(true);
  });

  it("asks before replacing unsaved changes", async () => {
    isUnsaved.set(true);
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    expect(await followJavaFile()).toBe(false);
    expect(confirm).toHaveBeenCalled();
    expect(env.api.followJavaFile).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("does nothing outside the desktop app", async () => {
    (globalThis as { electronAPI?: unknown }).electronAPI = {
      readFile: vi.fn(),
    };
    expect(await followJavaFile()).toBe(false);
  });

  it("prompts before editing when following a Java file", async () => {
    expect(confirmFollowedJavaEdit()).toBe(true);
    await followJavaFile();

    const confirmSpy = vi.spyOn(globalThis, "confirm").mockReturnValue(false);
    expect(confirmFollowedJavaEdit()).toBe(false);
    expect(confirmSpy).toHaveBeenCalled();
    expect(get(followedJava)).not.toBeNull();

    confirmSpy.mockReturnValue(true);
    expect(confirmFollowedJavaEdit()).toBe(true);
    expect(get(followedJava)).toBeNull();
    expect(get(isUnsaved)).toBe(true);
    confirmSpy.mockRestore();
  });
});

describe("syntaxProblem", () => {
  it("puts java-parser's errors plainly", () => {
    expect(
      syntaxProblem(
        "Sad sad panda, parsing errors detected in line: 4, column: 5!\nExpecting --> ';' <-- but found --> 'foo' <--!",
      ),
    ).toEqual({ line: 4, message: "Expected ; but found foo." });
    // A missing ";" is on the line before the token after it.
    const source = "class A {\n  int x = 1\n\n  // note\n  int y;\n}";
    expect(
      syntaxProblem(
        "parsing errors detected in line: 5, column: 3!\nExpecting --> ';' <-- but found --> 'int' <--!",
        source,
      ),
    ).toEqual({ line: 2, message: "Expected ; but found int." });
    expect(syntaxProblem("something else")).toEqual({
      line: 0,
      message: "The Java doesn't compile here.",
    });
  });
});
