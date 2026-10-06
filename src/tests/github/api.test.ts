// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  branchNameProblem,
  createGitHubClient,
  desktopFetch,
  GitHubError,
  toBase64,
} from "../../utils/github/api";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function clientWith(
  respond: (url: string, init?: RequestInit) => Response | Promise<Response>,
  token: string | null = null,
) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
    respond(String(url), init),
  );
  return {
    client: createGitHubClient(() => token, fetchMock as typeof fetch),
    fetchMock,
  };
}

describe("GitHub client", () => {
  it("reads a repository without a token", async () => {
    const { client, fetchMock } = clientWith(() =>
      json({
        name: "Robot",
        owner: { login: "Team" },
        default_branch: "main",
        private: false,
      }),
    );
    expect(await client.getRepo("team", "robot")).toEqual({
      owner: "Team",
      repo: "Robot",
      defaultBranch: "main",
      isPrivate: false,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/team/robot");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      undefined,
    );
  });

  it("sends the token when there is one", async () => {
    const { client, fetchMock } = clientWith(
      () => json({ login: "student" }),
      "secret",
    );
    expect(await client.getViewer()).toBe("student");
    const init = fetchMock.mock.calls[0][1];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer secret",
    );
  });

  it("lists only files, and finds branch heads with slashes in their names", async () => {
    const { client, fetchMock } = clientWith((url) =>
      url.includes("/git/trees/")
        ? json({
            tree: [
              { path: "TeamCode", type: "tree", sha: "t1" },
              { path: "TeamCode/a.turt", type: "blob", sha: "b1", size: 3 },
            ],
            truncated: false,
          })
        : json({ object: { sha: "c1" } }),
    );
    expect(await client.getBranchHead("team", "robot", "feature/auto")).toBe(
      "c1",
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.github.com/repos/team/robot/git/ref/heads/feature/auto",
    );
    expect(await client.getFiles("team", "robot", "c1")).toEqual({
      files: [{ path: "TeamCode/a.turt", sha: "b1", size: 3 }],
      truncated: false,
    });
  });

  it("downloads files from raw.githubusercontent.com at a commit", async () => {
    const { client, fetchMock } = clientWith(() => new Response("contents"));
    expect(
      await client.readFile("team", "robot", "c1", "Auto Paths/Far side.turt"),
    ).toBe("contents");
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://raw.githubusercontent.com/team/robot/c1/Auto%20Paths/Far%20side.turt",
    );
  });

  describe("errors", () => {
    async function errorFor(response: Response | Error): Promise<GitHubError> {
      const { client } = clientWith(() => {
        if (response instanceof Error) throw response;
        return response;
      });
      return client.getRepo("team", "robot").then(
        () => {
          throw new Error("Expected the request to fail");
        },
        (e: GitHubError) => e,
      );
    }

    it("explains the rate limit and when it resets", async () => {
      const reset = Math.floor(Date.now() / 1000) + 600;
      const error = await errorFor(
        json({ message: "API rate limit exceeded" }, 403, {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(reset),
        }),
      );
      expect(error).toBeInstanceOf(GitHubError);
      expect(error.kind).toBe("rate-limit");
      expect(error.message).toMatch(/Add a token/);
      expect(error.resetAt?.getTime()).toBe(reset * 1000);
    });

    it("says a missing repository may be private", async () => {
      const error = await errorFor(json({ message: "Not Found" }, 404));
      expect(error.kind).toBe("not-found");
      expect(error.message).toMatch(/Private repositories aren't supported/);
    });

    it("says when a token was refused", async () => {
      expect((await errorFor(json({}, 401))).kind).toBe("unauthorized");
    });

    it("says when GitHub can't be reached", async () => {
      const error = await errorFor(new TypeError("Failed to fetch"));
      expect(error.kind).toBe("network");
      expect(error.message).toMatch(/internet connection/);
    });
  });

  describe("committing", () => {
    const request = {
      owner: "team",
      repo: "robot",
      branch: "main",
      expectedHeadSha: "c1",
      message: "Update Far\n\nMoved the second path.",
      additions: { "AutoPaths/Far.turt": '{"x":"é"}' },
      deletions: ["AutoPaths/Old.turt"],
    };

    it("needs a token", async () => {
      const { client, fetchMock } = clientWith(() => json({}));
      await expect(client.commit(request)).rejects.toMatchObject({
        kind: "unauthorized",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends every file in one GraphQL commit", async () => {
      const { client, fetchMock } = clientWith(
        () =>
          json({
            data: {
              createCommitOnBranch: {
                commit: { oid: "c2", url: "https://github.com/c2" },
              },
            },
          }),
        "secret",
      );
      expect(await client.commit(request)).toEqual({
        sha: "c2",
        url: "https://github.com/c2",
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.github.com/graphql");
      const input = JSON.parse(init!.body as string).variables.input;
      expect(input).toEqual({
        branch: { repositoryNameWithOwner: "team/robot", branchName: "main" },
        message: { headline: "Update Far", body: "Moved the second path." },
        expectedHeadOid: "c1",
        fileChanges: {
          additions: [
            { path: "AutoPaths/Far.turt", contents: toBase64('{"x":"é"}') },
          ],
          deletions: [{ path: "AutoPaths/Old.turt" }],
        },
      });
    });

    it("says to update first when someone else committed", async () => {
      const { client } = clientWith(
        () =>
          json({
            errors: [
              {
                type: "STALE_DATA",
                message: 'Expected branch to point to "c1" but it did not.',
              },
            ],
          }),
        "secret",
      );
      await expect(client.commit(request)).rejects.toMatchObject({
        kind: "stale",
        message: expect.stringMatching(/Update from GitHub/),
      });
    });

    it("says when the token can't write to the repository", async () => {
      const { client } = clientWith(
        () =>
          json({
            errors: [
              {
                type: "FORBIDDEN",
                message: "Resource not accessible by personal access token",
              },
            ],
          }),
        "secret",
      );
      await expect(client.commit(request)).rejects.toMatchObject({
        kind: "forbidden",
        message: expect.stringMatching(/Read and write/),
      });
    });
  });

  it("encodes UTF-8 text as base64", () => {
    expect(toBase64("héllo")).toBe(Buffer.from("héllo").toString("base64"));
    const long = "x".repeat(100_000);
    expect(toBase64(long)).toBe(Buffer.from(long).toString("base64"));
  });

  it("says when GitHub doesn't answer in time", async () => {
    const { client } = clientWith(() => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    await expect(client.getRepo("team", "robot")).rejects.toMatchObject({
      kind: "network",
      message: expect.stringMatching(/didn't answer in time/),
    });
  });

  it("checks branch names before GitHub does", () => {
    expect(branchNameProblem("paths/far-1007")).toBeNull();
    for (const bad of ["", "new auto", "a..b", "-x", "x/", "x.lock", "a~b"]) {
      expect(branchNameProblem(bad), bad).not.toBeNull();
    }
  });
});

describe("desktopFetch", () => {
  afterEach(() => {
    delete (globalThis as { electronAPI?: unknown }).electronAPI;
  });

  const withBridge = (answer: unknown) => {
    const githubFetch = vi.fn(async () => answer);
    (globalThis as { electronAPI?: unknown }).electronAPI = { githubFetch };
    return { fetch: desktopFetch()!, githubFetch };
  };

  it("is only there in the desktop app", () => {
    expect(desktopFetch()).toBeUndefined();
  });

  it("sends the request to the main process and rebuilds the response", async () => {
    const { fetch, githubFetch } = withBridge({
      status: 200,
      headers: { "x-ratelimit-remaining": "59" },
      body: '{"ok":true}',
    });
    const res = await fetch("https://api.github.com/user", {
      method: "POST",
      headers: { Accept: "x" },
      body: "{}",
    });
    expect(githubFetch).toHaveBeenCalledWith("https://api.github.com/user", {
      method: "POST",
      headers: { accept: "x" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-ratelimit-remaining")).toBe("59");
    expect(await res.json()).toEqual({ ok: true });
  });

  it("turns failures into the errors fetch would throw", async () => {
    await expect(
      withBridge({ error: "network" }).fetch("https://api.github.com/user"),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      withBridge({ error: "timeout" }).fetch("https://api.github.com/user"),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    const empty = await withBridge({ status: 204, body: "" }).fetch(
      "https://api.github.com/x",
    );
    expect(empty.status).toBe(204);
  });
});
