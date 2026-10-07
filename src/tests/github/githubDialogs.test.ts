// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { githubPath } from "../../utils/github/paths";
import type { FakeGitHub } from "./fakeGitHub";

const AUTO = "TeamCode/src/main/assets/AutoPaths";

vi.mock("../../utils/github/repos", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/github/repos")>();
  const { FakeGitHub } = await import("./fakeGitHub");
  const { memoryRepoStorage } = await import("../../utils/github/storage");
  const github = new FakeGitHub();
  return {
    ...actual,
    fakeGitHub: github,
    githubRepos: new actual.GitHubRepos(github, memoryRepoStorage()),
  };
});

const reposModule =
  (await import("../../utils/github/repos")) as typeof import("../../utils/github/repos") & {
    fakeGitHub: FakeGitHub;
  };
const { githubRepos } = reposModule;
const github = reposModule.fakeGitHub;
const { setGitHubToken, clearGitHubToken } =
  await import("../../utils/github/token");
const { default: GitHubOpenDialog } =
  await import("../../lib/components/github/GitHubOpenDialog.svelte");
const { default: GitHubCommitDialog } =
  await import("../../lib/components/github/GitHubCommitDialog.svelte");
const { default: GitHubRepoBar } =
  await import("../../lib/components/github/GitHubRepoBar.svelte");
const { default: GitHubTokenForm } =
  await import("../../lib/components/github/GitHubTokenForm.svelte");

let repoCount = 0;
let ref: { owner: string; repo: string };
const at = (p: string) => githubPath(ref, p);

beforeEach(() => {
  // A fresh repository for each test.
  ref = { owner: "team", repo: `robot${++repoCount}` };
  github.addRepo(ref.owner, ref.repo, {
    [`${AUTO}/Far.turt`]: "{}",
    "README.md": "",
  });
  github.addBranch(ref.owner, ref.repo, "dev");
  void clearGitHubToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHubOpenDialog", () => {
  it("finds a repository from a link and opens it in the AutoPaths folder", async () => {
    const onopened = vi.fn();
    render(GitHubOpenDialog, { show: true, onopened });

    await fireEvent.input(screen.getByLabelText("GitHub link"), {
      target: { value: `https://github.com/${ref.owner}/${ref.repo}` },
    });
    await fireEvent.click(screen.getByText("Find"));

    await screen.findByText(`${ref.owner}/${ref.repo}`);
    expect(screen.getByRole("combobox")).toHaveValue("main");
    await fireEvent.click(screen.getByText("Open"));

    await waitFor(() => expect(onopened).toHaveBeenCalled());
    const opened = onopened.mock.calls[0][0];
    expect(opened.folder).toBe(at(AUTO));
    expect(opened.file).toBeUndefined();
    expect(opened.record.branch).toBe("main");
  });

  it("opens the file a link names", async () => {
    const onopened = vi.fn();
    render(GitHubOpenDialog, { show: true, onopened });
    await fireEvent.input(screen.getByLabelText("GitHub link"), {
      target: {
        value: `https://github.com/${ref.owner}/${ref.repo}/blob/dev/${AUTO}/Far.turt`,
      },
    });
    await fireEvent.click(screen.getByText("Find"));
    await screen.findByText(`${AUTO}/Far.turt`);
    expect(screen.getByRole("combobox")).toHaveValue("dev");
    await fireEvent.click(screen.getByText("Open"));

    await waitFor(() => expect(onopened).toHaveBeenCalled());
    expect(onopened.mock.calls[0][0]).toMatchObject({
      folder: at(AUTO),
      file: at(`${AUTO}/Far.turt`),
    });
  });

  it("explains what to paste when the link isn't a repository", async () => {
    render(GitHubOpenDialog, { show: true, onopened: vi.fn() });
    await fireEvent.input(screen.getByLabelText("GitHub link"), {
      target: { value: "my robot code" },
    });
    await fireEvent.click(screen.getByText("Find"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /doesn't look like a GitHub repository link/,
    );
  });

  it("lists repositories opened before", async () => {
    await githubRepos.open(ref, "main");
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    const onopened = vi.fn();
    render(GitHubOpenDialog, { show: true, onopened });
    const entry = await screen.findByText(`${ref.owner}/${ref.repo}`);
    expect(entry.closest("button")).toHaveTextContent("1 not committed");
    await fireEvent.click(entry);
    await waitFor(() =>
      expect(onopened.mock.calls[0][0].record.repo).toBe(ref.repo),
    );
  });
});

describe("GitHubCommitDialog", () => {
  beforeEach(async () => {
    await githubRepos.open(ref, "main");
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), '{"edited":true}');
    await githubRepos.writeFile(
      at("TeamCode/src/main/java/Far.java"),
      "class Far {}",
    );
  });

  it("asks for a token before committing", async () => {
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);
    expect(screen.getByLabelText("GitHub token")).toBeInTheDocument();
    expect(screen.getByText("Commit")).toBeDisabled();
  });

  it("lists the edits and commits them together", async () => {
    await setGitHubToken("token", false);
    const onchanged = vi.fn();
    render(GitHubCommitDialog, {
      show: true,
      repo: ref,
      branch: "main",
      onchanged,
    });

    await screen.findByText(`${AUTO}/Far.turt`);
    expect(
      screen.getByText("TeamCode/src/main/java/Far.java"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toHaveValue(
      "Update Far.turt, Far.java",
    );

    await fireEvent.click(screen.getByText("Commit"));
    const link = await screen.findByText("View the commit");
    expect(link.getAttribute("href")).toContain(`/${ref.repo}/commit/`);
    expect(onchanged).toHaveBeenCalled();
    expect(github.filesOn(ref.owner, ref.repo)[`${AUTO}/Far.turt`]).toBe(
      '{"edited":true}',
    );
  });

  it("offers to update when someone else committed first", async () => {
    await setGitHubToken("token", false);
    github.push(ref.owner, ref.repo, "main", { "README.md": "theirs" });
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);

    await fireEvent.click(screen.getByText("Commit"));
    await fireEvent.click(await screen.findByText("Update from GitHub"));
    await waitFor(() =>
      expect(screen.queryByText("Update from GitHub")).toBeNull(),
    );

    await fireEvent.click(await screen.findByText("Commit"));
    await screen.findByText("View the commit");
    expect(github.filesOn(ref.owner, ref.repo)["README.md"]).toBe("theirs");
  });
});

describe("GitHubRepoBar", () => {
  beforeEach(() => githubRepos.open(ref, "main"));

  it("shows the repository, branch and how many edits there are", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    render(GitHubRepoBar, { repo: ref, onleave: vi.fn(), onchanged: vi.fn() });
    expect(screen.getByText(`${ref.owner}/${ref.repo}`)).toBeInTheDocument();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("Commit (1)")).toBeEnabled();
  });

  it("asks which version to keep when updating finds a conflict", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push(ref.owner, ref.repo, "main", {
      [`${AUTO}/Far.turt`]: "theirs",
    });
    const onchanged = vi.fn();
    render(GitHubRepoBar, { repo: ref, onleave: vi.fn(), onchanged });

    await fireEvent.click(screen.getByText("Update"));
    expect(await screen.findByText(`${AUTO}/Far.turt`)).toBeInTheDocument();
    await fireEvent.click(screen.getByText("Use GitHub's"));

    await waitFor(() => expect(onchanged).toHaveBeenCalled());
    expect(await githubRepos.readFile(at(`${AUTO}/Far.turt`))).toBe("theirs");
    expect(screen.getByText("Commit")).toBeDisabled();
  });

  it("closes the repository after confirming", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const onleave = vi.fn();
    render(GitHubRepoBar, { repo: ref, onleave, onchanged: vi.fn() });
    await fireEvent.click(screen.getByLabelText("More repository actions"));
    await fireEvent.click(screen.getByText("Close repository"));
    await waitFor(() => expect(onleave).toHaveBeenCalled());
    expect(await githubRepos.get(ref)).toBeUndefined();
  });
});

describe("GitHubTokenForm", () => {
  it("checks the token with GitHub before keeping it", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ login: "student" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onsaved = vi.fn();
    render(GitHubTokenForm, { onsaved });

    await fireEvent.input(screen.getByLabelText("GitHub token"), {
      target: { value: " github_pat_abc " },
    });
    await fireEvent.click(screen.getByText("Add token"));

    await waitFor(() => expect(onsaved).toHaveBeenCalledWith("student"));
    expect(
      screen.getByText(/Commits are made as @student/),
    ).toBeInTheDocument();
    expect(
      JSON.parse(sessionStorage.getItem("turtle-tracer-github-token")!),
    ).toMatchObject({ token: "github_pat_abc", login: "student" });
    expect(localStorage.getItem("turtle-tracer-github-token")).toBeNull();
  });

  it("doesn't keep a token GitHub refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    render(GitHubTokenForm, {});
    await fireEvent.input(screen.getByLabelText("GitHub token"), {
      target: { value: "bad" },
    });
    await fireEvent.click(screen.getByText("Add token"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /didn't accept your token/,
    );
    expect(sessionStorage.getItem("turtle-tracer-github-token")).toBeNull();
  });
});

describe("committing safely", () => {
  beforeEach(async () => {
    await githubRepos.open(ref, "main");
    await setGitHubToken("token", false, "student");
  });

  it("makes you confirm before deleting files from GitHub", async () => {
    await githubRepos.deleteFile(at(`${AUTO}/Far.turt`));
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);
    const commit = screen.getByRole("button", { name: "Commit" });
    expect(commit).toBeDisabled();
    await fireEvent.click(
      screen.getByLabelText(/Delete this file from GitHub for everyone/),
    );
    expect(commit).toBeEnabled();
  });

  it("says who the commit will be made as", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    expect(await screen.findByText("as @student")).toBeInTheDocument();
  });

  it("commits to a new branch and links to a pull request", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);
    await fireEvent.click(screen.getByLabelText(/Commit to a new branch/));
    expect(
      (screen.getByLabelText("New branch name") as HTMLInputElement).value,
    ).toMatch(/^paths\/far-\d\d-\d\d$/);

    await fireEvent.input(screen.getByLabelText("New branch name"), {
      target: { value: "bad name" },
    });
    expect(screen.getByText(/can't have spaces/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();

    await fireEvent.input(screen.getByLabelText("New branch name"), {
      target: { value: "paths/try-this" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    const link = await screen.findByText("Open a pull request");
    expect(link.getAttribute("href")).toContain(
      `/${ref.repo}/compare/main...paths%2Ftry-this`,
    );
    expect(
      github.filesOn(ref.owner, ref.repo, "paths/try-this")[`${AUTO}/Far.turt`],
    ).toBe("edited");
    expect(screen.getByText(/reaches the robot after/)).toBeInTheDocument();
  });

  it("switches to a new branch when the branch only takes pull requests", async () => {
    github.protectedBranches.add("main");
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);
    await fireEvent.click(screen.getByRole("button", { name: "Commit" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText(/Commit to a new branch/)).toBeChecked();
    github.protectedBranches.delete("main");
  });

  it("explains why another tab can't commit", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    githubRepos.editable.set(false);
    render(GitHubCommitDialog, { show: true, repo: ref, branch: "main" });
    await screen.findByText(`${AUTO}/Far.turt`);
    expect(screen.getByText(/another Turtle Tracer tab/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Commit" })).toBeDisabled();
    githubRepos.editable.set(true);
  });
});

describe("GitHubTokenForm checks the repository", () => {
  it("warns when the account can't push to the repository", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("/user")
          ? new Response(JSON.stringify({ login: "visitor" }))
          : new Response(JSON.stringify({ permissions: { push: false } })),
      ),
    );
    render(GitHubTokenForm, { repo: ref });
    expect(
      screen.getByText(ref.repo, { selector: "strong" }),
    ).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText("GitHub token"), {
      target: { value: "github_pat_x" },
    });
    await fireEvent.click(screen.getByText("Add token"));
    expect(await screen.findByRole("status")).toHaveTextContent(
      `@visitor can't push to ${ref.owner}/${ref.repo}`,
    );
  });
});

describe("GitHubRepoBar ways out", () => {
  beforeEach(() => githubRepos.open(ref, "main"));

  it("moves the edits to another branch", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    const onchanged = vi.fn();
    render(GitHubRepoBar, { repo: ref, onleave: vi.fn(), onchanged });
    await fireEvent.click(screen.getByLabelText("More repository actions"));
    await fireEvent.click(screen.getByText("Switch branch…"));
    expect(await screen.findByRole("combobox")).toHaveValue("dev");
    await fireEvent.click(screen.getByRole("button", { name: "Switch" }));
    await waitFor(() => expect(onchanged).toHaveBeenCalled());
    expect((await githubRepos.get(ref))?.branch).toBe("dev");
    expect(await githubRepos.readFile(at(`${AUTO}/Far.turt`))).toBe("edited");
  });

  it("keeps both versions when asked", async () => {
    await githubRepos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push(ref.owner, ref.repo, "main", {
      [`${AUTO}/Far.turt`]: "theirs",
    });
    render(GitHubRepoBar, { repo: ref, onleave: vi.fn(), onchanged: vi.fn() });
    await fireEvent.click(screen.getByText("Update"));
    await fireEvent.click(
      await screen.findByRole("button", { name: "Keep both" }),
    );
    await waitFor(async () =>
      expect(
        await githubRepos.readFile(at(`${AUTO}/Far (my version).turt`)),
      ).toBe("mine"),
    );
    expect(await githubRepos.readFile(at(`${AUTO}/Far.turt`))).toBe("theirs");
  });
});
