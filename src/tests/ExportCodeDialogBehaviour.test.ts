// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

const files = vi.hoisted(() => ({
  projectFileJson: vi.fn(async () => '{"project":true}'),
  exportAsProjectFile: vi.fn(),
  triggerDownload: vi.fn(),
  api: undefined as any,
}));
vi.mock("../utils/fileHandlers", () => ({
  projectFileJson: files.projectFileJson,
  exportAsProjectFile: files.exportAsProjectFile,
}));
vi.mock("../utils/file", () => ({ triggerDownload: files.triggerDownload }));
vi.mock("../utils/platform", () => ({ getElectronAPI: () => files.api }));

import ExportCodeDialogWrapper from "./ExportCodeDialogWrapper.svelte";
import { exporterRegistry } from "../lib/exporters";
import { customExportersStore } from "../lib/pluginsStore";
import { settingsStore } from "../lib/projectStore";
import { currentFilePath, notification } from "../stores";
import { DEFAULT_SETTINGS } from "../config/defaults";

// fireEvent wants a Window; the lint rules want globalThis.
const win = globalThis as unknown as Window;

type Format = "java" | "points" | "sequential" | "json" | "custom";

/** Renders the dialog closed, with `isOpen` readable and a way to open it. */
function mount() {
  const { component } = render(ExportCodeDialogWrapper);
  const wrapper = component as any;
  const state = {
    get isOpen(): boolean {
      return wrapper.isDialogOpen();
    },
  };
  const open = (format: Format, name?: string) =>
    wrapper.openWithFormat(format, name);
  return { state, open };
}

/** The set-once export options start folded away. */
const showOptions = () =>
  fireEvent.click(screen.getByRole("button", { name: /Options/ }));

const javaExporter = () =>
  vi.fn(
    async (_data: unknown, settings: any) =>
      `public class ${settings.fileName} {}\n// ${settings.packageName}`,
  );

let clipboard: { writeText: ReturnType<typeof vi.fn> };

beforeEach(() => {
  exporterRegistry.reset();
  customExportersStore.set([]);
  settingsStore.set({ ...DEFAULT_SETTINGS } as any);
  currentFilePath.set(null);
  notification.set(null);
  files.api = undefined;
  files.triggerDownload.mockClear();
  files.projectFileJson.mockClear();
  clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
  Object.defineProperty(navigator, "clipboard", {
    value: clipboard,
    configurable: true,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("generating code", () => {
  it("opens with the generated code and the right title", async () => {
    const exporter = vi.fn(async () => "line one\nline two\nline three");
    exporterRegistry.register({
      id: "points",
      name: "Points",
      exportCode: exporter,
    });
    const { state, open } = mount();
    await open("points");
    expect(state.isOpen).toBe(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Export Points")).toBeInTheDocument();
    expect(screen.getByText("3 lines generated")).toBeInTheDocument();
  });

  it("passes the project and the export settings to the exporter", async () => {
    const exporter = javaExporter();
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: exporter,
    });
    const { open } = mount();
    await open("java");
    const [data, options] = exporter.mock.calls[0] as any[];
    expect(data).toHaveProperty("startPoint");
    expect(data).toHaveProperty("lines");
    expect(options).toMatchObject({
      fileName: "AutoPath",
      exportFullCode: true,
      packageName: "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      telemetryImpl: "Panels",
      hardcodeValues: true,
      targetLibrary: "SolversLib",
    });
  });

  it("uses the user's own export settings when they have set them", async () => {
    settingsStore.update(
      (s) =>
        ({
          ...s,
          autoExportFullClass: false,
          javaPackageName: "org.team.auto",
          telemetryImplementation: "Dashboard",
          autoExportEmbedPoseData: false,
          autoExportTargetLibrary: "NextFTC",
        }) as any,
    );
    const exporter = javaExporter();
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: exporter,
    });
    const { open } = mount();
    await open("java");
    expect((exporter.mock.calls[0] as any[])[1]).toMatchObject({
      exportFullCode: false,
      packageName: "org.team.auto",
      telemetryImpl: "Dashboard",
      hardcodeValues: false,
      targetLibrary: "NextFTC",
    });
  });

  it("shows the project file for the JSON format, with its own download button", async () => {
    currentFilePath.set("/p/auto.turt");
    const { open } = mount();
    await open("json");
    expect(files.projectFileJson).toHaveBeenCalledWith("/p/auto.turt");
    expect(screen.getByText("Project Data")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Save the generated content to a file"),
    ).toBeNull();
    await fireEvent.click(screen.getByText("Download as .turt"));
    expect(files.exportAsProjectFile).toHaveBeenCalled();
  });

  it("says so when nothing can export that format", async () => {
    const { open } = mount();
    await open("points");
    expect(screen.getByText("Exporter not found.")).toBeInTheDocument();
  });

  it("shows a message instead of crashing when an exporter fails", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: async () => {
        throw new Error("bad data");
      },
    });
    const { state, open } = mount();
    await open("java");
    expect(state.isOpen).toBe(true);
    expect(screen.getByText(/Error refreshing code/)).toBeInTheDocument();
  });

  describe("plugin exporters", () => {
    it("shows the output of the plugin that was chosen", async () => {
      customExportersStore.set([
        { name: "Other", handler: async () => "nope" },
        { name: "CSV", handler: async () => "a,b,c" },
      ] as any);
      const { open } = mount();
      await open("custom", "CSV");
      expect(screen.getByText("CSV", { selector: "h2" })).toBeInTheDocument();
      expect(
        screen.getByText("Output generated by plugin."),
      ).toBeInTheDocument();
      expect(document.body.textContent).toContain("a,b,c");
    });

    it("says when the plugin is gone", async () => {
      const { open } = mount();
      await open("custom", "Missing");
      expect(screen.getByText("Exporter not found.")).toBeInTheDocument();
      await open("custom"); // no name at all
      expect(screen.getByText("Exporter not found.")).toBeInTheDocument();
    });

    it("shows a plugin's error rather than failing the dialog", async () => {
      customExportersStore.set([
        {
          name: "Broken",
          handler: async () => {
            throw new Error("plugin exploded");
          },
        },
      ] as any);
      const { open } = mount();
      await open("custom", "Broken");
      expect(document.body.textContent).toContain(
        "Error in plugin: Error: plugin exploded",
      );
    });
  });
});

describe("the sequential command class name", () => {
  const sequential = () => {
    const exporter = javaExporter();
    exporterRegistry.register({
      id: "sequential",
      name: "Sequential",
      exportCode: exporter,
    });
    return exporter;
  };
  const classInput = () =>
    screen.getByLabelText("Class Name") as HTMLInputElement;

  it("is taken from the open file's name, made safe for Java", async () => {
    const exporter = sequential();
    currentFilePath.set(String.raw`C:\Teams\Red Side-1.turt`);
    const { open } = mount();
    await open("sequential");
    expect(classInput().value).toBe("Red_Side_1");
    expect((exporter.mock.calls.at(-1) as any[])[1].fileName).toBe(
      "Red_Side_1",
    );
  });

  it("also strips the old .pp extension", async () => {
    sequential();
    currentFilePath.set("/p/legacy.pp");
    const { open } = mount();
    await open("sequential");
    expect(classInput().value).toBe("legacy");
  });

  it("stays as AutoPath when there is no file", async () => {
    sequential();
    const { open } = mount();
    await open("sequential");
    expect(classInput().value).toBe("AutoPath");
  });

  it("keeps a name the user typed, and regenerates with it", async () => {
    const exporter = sequential();
    currentFilePath.set("/p/first.turt");
    const { open } = mount();
    await open("sequential");
    await fireEvent.input(classInput(), { target: { value: "MyAuto" } });
    await waitFor(() =>
      expect((exporter.mock.calls.at(-1) as any[])[1].fileName).toBe("MyAuto"),
    );

    currentFilePath.set("/p/second.turt");
    await waitFor(() => expect(classInput().value).toBe("MyAuto"));
  });

  it("switches library and regenerates", async () => {
    const exporter = sequential();
    const { open } = mount();
    await open("sequential");
    await fireEvent.click(screen.getByRole("tab", { name: "NextFTC" }));
    await waitFor(() =>
      expect((exporter.mock.calls.at(-1) as any[])[1].targetLibrary).toBe(
        "NextFTC",
      ),
    );
    expect(get(settingsStore).autoExportTargetLibrary).toBe("NextFTC");
    expect(
      screen.getByText(/Command-based sequence for NextFTC/),
    ).toBeInTheDocument();
  });

  it("offers Ivy and warns that it is experimental", async () => {
    const exporter = sequential();
    const { open } = mount();
    await open("sequential");
    expect(screen.queryByText(/output is/)).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole("tab", { name: "Ivy" }));
    await waitFor(() =>
      expect((exporter.mock.calls.at(-1) as any[])[1].targetLibrary).toBe(
        "Ivy",
      ),
    );
    expect(get(settingsStore).autoExportTargetLibrary).toBe("Ivy");
    expect(
      screen.getByText(/Command-based sequence for Pedro Pathing's Ivy/),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Ivy output is experimental",
    );
  });

  it("restores the default package when it is cleared and Enter is pressed", async () => {
    sequential();
    settingsStore.update((s) => ({ ...s, javaPackageName: "  " }) as any);
    const { open } = mount();
    await open("sequential");
    await showOptions();
    const pkg = screen.getByLabelText("Package Name");
    await fireEvent.keyDown(pkg, { key: "Enter" });
    await waitFor(() =>
      expect(get(settingsStore).javaPackageName).toBe(
        "org.firstinspires.ftc.teamcode.Commands.AutoCommands",
      ),
    );
  });

  it("leaves a filled-in package alone on Enter, and ignores other keys", async () => {
    sequential();
    settingsStore.update((s) => ({ ...s, javaPackageName: "org.team" }) as any);
    const { open } = mount();
    await open("sequential");
    await showOptions();
    const pkg = screen.getByLabelText("Package Name");
    await fireEvent.keyDown(pkg, { key: "Enter" });
    await fireEvent.keyDown(pkg, { key: "a" });
    expect(get(settingsStore).javaPackageName).toBe("org.team");
  });
});

describe("the export options", () => {
  const sequential = () =>
    exporterRegistry.register({
      id: "sequential",
      name: "Sequential",
      exportCode: javaExporter(),
    });

  it("keeps the everyday controls in view and the set-once ones folded away", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const { open } = mount();
    await open("java");
    expect(screen.getByRole("tab", { name: "Kotlin" })).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: /Options/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("Package Name")).toBeNull();
    expect(screen.queryByLabelText(/Command Registrar/)).toBeNull();
    expect(screen.queryByText("Imperial (Inches)")).toBeNull();
  });

  it("unfolds to package, registrar, units and the full-class switch, which is on by default", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    expect(screen.getByRole("button", { name: /Options/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByLabelText("Package Name")).toBeInTheDocument();
    expect(screen.getByLabelText(/Command Registrar/)).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Imperial (Inches)" }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Metric (cm)" }),
    ).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: "Export full Java class with imports",
      }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText("Embed pose data directly in the code"),
    ).toBeNull();
  });

  it("offers embedding poses, on by default, instead of the full-class switch for sequential code", async () => {
    sequential();
    const { open } = mount();
    await open("sequential");
    expect(screen.getByLabelText("Class Name")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "NextFTC" })).toBeInTheDocument();
    await showOptions();
    expect(
      screen.getByRole("checkbox", {
        name: "Embed pose data directly in the code",
      }),
    ).toBeChecked();
    expect(
      screen.queryByLabelText("Export full Java class with imports"),
    ).toBeNull();
  });

  it("opens itself when metric code needs the poses embedded, so the fix is in reach", async () => {
    sequential();
    settingsStore.update(
      (s) =>
        ({
          ...s,
          codeUnits: "metric",
          autoExportEmbedPoseData: false,
        }) as any,
    );
    const { open } = mount();
    await open("sequential");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Metric code generation requires embedding poses",
    );
    await fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Embed pose data directly in the code",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("the command registrar", () => {
  const sequential = () =>
    exporterRegistry.register({
      id: "sequential",
      name: "Sequential",
      exportCode: javaExporter(),
    });

  it("is offered for Java code only, not for command groups or points", async () => {
    sequential();
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    exporterRegistry.register({
      id: "points",
      name: "Points",
      exportCode: vi.fn(async () => "points"),
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    expect(screen.getByLabelText(/Command Registrar/)).toBeInTheDocument();
    await open("sequential");
    expect(screen.getByLabelText("Package Name")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Command Registrar/)).toBeNull();
    expect(screen.queryByTestId("registrar-summary")).toBeNull();
    await open("points");
    expect(screen.queryByLabelText(/Command Registrar/)).toBeNull();
  });

  it("is saved with the settings and sent to the exporter", async () => {
    const exporter = javaExporter();
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: exporter,
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    const input = screen.getByLabelText(/Command Registrar/);
    await fireEvent.input(input, {
      target: { value: "org.team.RobotCommands.register" },
    });
    expect(get(settingsStore).commandRegistrar).toBe(
      "org.team.RobotCommands.register",
    );
    await waitFor(() =>
      expect(exporter).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({
          commandRegistrar: "org.team.RobotCommands.register",
        }),
      ),
    );
  });

  it("says what it will write, in the language being exported", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    expect(screen.queryByTestId("registrar-summary")).toBeNull();
    await fireEvent.input(screen.getByLabelText(/Command Registrar/), {
      target: { value: "org.team.RobotCommands.register" },
    });
    const summary = screen.getByTestId("registrar-summary");
    expect(summary).toHaveTextContent(
      "Adds register(hardwareMap); to init() when the path has event markers.",
    );
    // The full statement, and why it needs no import, are on hover.
    expect(summary).toHaveAttribute(
      "title",
      expect.stringContaining("org.team.RobotCommands.register(hardwareMap);"),
    );

    await fireEvent.click(screen.getByRole("tab", { name: "Kotlin" }));
    expect(screen.getByTestId("registrar-summary")).toHaveTextContent(
      "Adds register(hardwareMap) to init() when the path has event markers.",
    );
  });

  it("shows the warning, not the summary, for a name that won't be written", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    await fireEvent.input(screen.getByLabelText(/Command Registrar/), {
      target: { value: "register" },
    });
    expect(screen.queryByTestId("registrar-summary")).toBeNull();
    expect(screen.getByText(/Use a class and method/)).toBeInTheDocument();
  });

  it("warns about a name that isn't a class and a method, and not about an empty one", async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const { open } = mount();
    await open("java");
    await showOptions();
    const input = screen.getByLabelText(/Command Registrar/);
    expect(screen.queryByText(/Use a class and method/)).toBeNull();
    await fireEvent.input(input, { target: { value: "register" } });
    expect(screen.getByText(/Use a class and method/)).toBeInTheDocument();
    await fireEvent.input(input, {
      target: { value: "org.team.RobotCommands.register" },
    });
    expect(screen.queryByText(/Use a class and method/)).toBeNull();
  });
});

describe("copying and saving", () => {
  const javaDialog = async () => {
    exporterRegistry.register({
      id: "java",
      name: "Java",
      exportCode: javaExporter(),
    });
    const view = mount();
    await view.open("java");
    return view;
  };

  it("copies the code and confirms", async () => {
    await javaDialog();
    await fireEvent.click(screen.getByText("Copy Code"));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalled());
    expect(clipboard.writeText.mock.calls[0][0]).toContain(
      "public class AutoPath",
    );
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(get(notification)).toMatchObject({
      message: "Code copied to clipboard!",
      type: "success",
    });
  });

  it("reports when the clipboard can't be used", async () => {
    clipboard.writeText.mockRejectedValue(new Error("denied"));
    await javaDialog();
    await fireEvent.click(screen.getByText("Copy Code"));
    await waitFor(() =>
      expect(get(notification)).toMatchObject({
        message: "Failed to copy code.",
        type: "error",
      }),
    );
    expect(screen.getByText("Copy Code")).toBeInTheDocument();
  });

  describe("saving in the browser", () => {
    it("downloads Java under the class it contains", async () => {
      await javaDialog();
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      expect(files.triggerDownload).toHaveBeenCalledWith(
        expect.stringContaining("public class AutoPath"),
        "text/plain",
        "AutoPath.java",
      );
    });

    it("downloads points as points.txt and plugin output as generated_code.txt", async () => {
      exporterRegistry.register({
        id: "points",
        name: "Points",
        exportCode: () => "1,2",
      });
      customExportersStore.set([
        { name: "CSV", handler: async () => "a,b" },
      ] as any);
      const { open } = mount();
      await open("points");
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      expect(files.triggerDownload).toHaveBeenLastCalledWith(
        "1,2",
        "text/plain",
        "points.txt",
      );
      await open("custom", "CSV");
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      expect(files.triggerDownload).toHaveBeenLastCalledWith(
        "a,b",
        "text/plain",
        "generated_code.txt",
      );
    });

    it("treats the browser's virtual file API as no desktop API", async () => {
      files.api = {
        isVirtual: true,
        showSaveDialog: vi.fn(),
        writeFile: vi.fn(),
      };
      await javaDialog();
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      expect(files.triggerDownload).toHaveBeenCalled();
      expect(files.api.showSaveDialog).not.toHaveBeenCalled();
    });
  });

  describe("saving in the desktop app", () => {
    beforeEach(() => {
      files.api = { showSaveDialog: vi.fn(), writeFile: vi.fn() };
    });

    it("asks where to save, offering a .java file name, and writes there", async () => {
      files.api.showSaveDialog.mockResolvedValue("/out/AutoPath.java");
      await javaDialog();
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      await waitFor(() => expect(files.api.writeFile).toHaveBeenCalled());
      expect(files.api.showSaveDialog.mock.calls[0][0]).toMatchObject({
        defaultPath: "AutoPath.java",
        filters: [{ name: "Java File", extensions: ["java"] }],
      });
      expect(files.api.writeFile).toHaveBeenCalledWith(
        "/out/AutoPath.java",
        expect.stringContaining("AutoPath"),
      );
      expect(files.triggerDownload).not.toHaveBeenCalled();
    });

    it("offers a text file for points", async () => {
      exporterRegistry.register({
        id: "points",
        name: "Points",
        exportCode: () => "1,2",
      });
      files.api.showSaveDialog.mockResolvedValue("/out/points.txt");
      const { open } = mount();
      await open("points");
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      await waitFor(() =>
        expect(files.api.writeFile).toHaveBeenCalledWith(
          "/out/points.txt",
          "1,2",
        ),
      );
      expect(files.api.showSaveDialog.mock.calls[0][0].filters).toEqual([
        { name: "Text File", extensions: ["txt"] },
      ]);
    });

    it("writes nothing if the user cancels", async () => {
      files.api.showSaveDialog.mockResolvedValue(undefined);
      await javaDialog();
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      await waitFor(() => expect(files.api.showSaveDialog).toHaveBeenCalled());
      expect(files.api.writeFile).not.toHaveBeenCalled();
    });

    it("tells the user when saving fails", async () => {
      const alertSpy = vi
        .spyOn(globalThis, "alert")
        .mockImplementation(() => {});
      files.api.showSaveDialog.mockResolvedValue("/out/x.java");
      files.api.writeFile.mockRejectedValue(new Error("disk full"));
      await javaDialog();
      await fireEvent.click(
        screen.getByLabelText("Save the generated content to a file"),
      );
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith("Failed to save file: disk full"),
      );
    });
  });
});

describe("searching the code", () => {
  const withCode = async (code: string) => {
    exporterRegistry.register({
      id: "points",
      name: "Points",
      exportCode: () => code,
    });
    const view = mount();
    await view.open("points");
    return view;
  };
  const search = async (text: string) => {
    const box = screen.getByPlaceholderText("Find...");
    await fireEvent.input(box, { target: { value: text } });
    return box;
  };

  it("Ctrl+F or Cmd+F opens the search box", async () => {
    await withCode("apple");
    await fireEvent.keyDown(win, { key: "f", ctrlKey: true });
    expect(await screen.findByPlaceholderText("Find...")).toBeInTheDocument();
  });

  it("counts matches ignoring case, and wraps around with next and previous", async () => {
    await withCode("Apple\nbanana\napple pie\ncherry");
    await fireEvent.click(screen.getByLabelText("Search code"));
    await search("APPLE");
    expect(await screen.findByText("1/2")).toBeInTheDocument();

    await fireEvent.click(screen.getByLabelText("Next match"));
    expect(screen.getByText("2/2")).toBeInTheDocument();
    await fireEvent.click(screen.getByLabelText("Next match"));
    expect(screen.getByText("1/2")).toBeInTheDocument();
    await fireEvent.click(screen.getByLabelText("Previous match"));
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("says when nothing matches, and disables next and previous", async () => {
    await withCode("apple");
    await fireEvent.click(screen.getByLabelText("Search code"));
    await search("zzz");
    expect(await screen.findByText("0/0")).toBeInTheDocument();
    expect(screen.getByLabelText("Next match")).toBeDisabled();
    expect(screen.getByLabelText("Previous match")).toBeDisabled();
  });

  it("Escape closes the search first, then the dialog", async () => {
    const { state } = await withCode("apple");
    await fireEvent.click(screen.getByLabelText("Search code"));
    await search("apple");
    await fireEvent.keyDown(win, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByPlaceholderText("Find...")).toBeNull(),
    );
    expect(state.isOpen).toBe(true);
    await fireEvent.keyDown(win, { key: "Escape" });
    expect(state.isOpen).toBe(false);
  });

  it("clearing the box clears the matches", async () => {
    await withCode("apple\napple");
    await fireEvent.click(screen.getByLabelText("Search code"));
    await search("apple");
    expect(await screen.findByText("1/2")).toBeInTheDocument();
    await search("");
    await waitFor(() => expect(screen.queryByText("1/2")).toBeNull());
  });
});

describe("closing", () => {
  it("closes with the Close button or by clicking the backdrop, but not by clicking the dialog", async () => {
    exporterRegistry.register({
      id: "points",
      name: "Points",
      exportCode: () => "x",
    });
    const { state, open } = mount();
    await open("points");

    await fireEvent.click(screen.getByRole("dialog"));
    expect(state.isOpen).toBe(true);

    await fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(state.isOpen).toBe(false);

    await open("points");
    await fireEvent.click(screen.getByText("Close"));
    expect(state.isOpen).toBe(false);
  });

  it("the header's close button closes it too", async () => {
    exporterRegistry.register({
      id: "points",
      name: "Points",
      exportCode: () => "x",
    });
    const { state, open } = mount();
    await open("points");
    await fireEvent.click(screen.getByLabelText("Close export dialog"));
    expect(state.isOpen).toBe(false);
  });
});
