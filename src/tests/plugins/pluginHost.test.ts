// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import type {
  PluginListing,
  PluginRecord,
  PluginsBridge,
} from "../../lib/plugins/protocol/ipc";

const bridge = vi.hoisted(() => ({ current: null as PluginsBridge | null }));
vi.mock("../../utils/platform", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getElectronAPI: () =>
    bridge.current ? { plugins: bridge.current } : undefined,
}));

const { pluginHost } = await import("../../lib/plugins/host/PluginHost");
const { setAppBridge } = await import("../../lib/plugins/bridge");
const { dialogRegistry, themeRegistry } = await import("../../lib/registries");
const { notification } = await import("../../stores");
const { startPlugins } = await import("../../lib/plugins");

const theme = (id: string, extra = {}): PluginListing => ({
  id,
  manifest: {
    id,
    name: id,
    version: "1.0.0",
    apiVersion: 2,
    themes: [{ name: `${id} theme`, css: "a{}" }],
    ...extra,
  },
  dependenciesInstalled: true,
});

function fakeBridge(
  plugins: PluginListing[],
  records: Record<string, PluginRecord> = {},
  extra: { safeMode?: boolean; crashedDuringBoot?: boolean } = {},
) {
  const state = structuredClone(records);
  const fake = {
    list: vi.fn(async () => ({
      plugins: structuredClone(plugins),
      records: structuredClone(state),
      safeMode: extra.safeMode ?? false,
      crashedDuringBoot: extra.crashedDuringBoot ?? false,
    })),
    anyEnabled: vi.fn(async () => Object.values(state).some((r) => r.enabled)),
    setEnabled: vi.fn(async (id: string, enabled: boolean) => {
      state[id] = { ...state[id], enabled };
      return state[id];
    }),
    setGrant: vi.fn(async (id: string, grant: string) => {
      state[id] = { ...state[id], grant };
      return state[id];
    }),
    setSettings: vi.fn(async (id: string, settings) => {
      state[id] = { ...state[id], settings };
      return state[id];
    }),
    load: vi.fn(async (id: string) => ({
      hasMain: false,
      themes: [{ name: `${id} theme`, css: "a{}" }],
    })),
    installDependencies: vi.fn(async () => []),
    storageGet: vi.fn(),
    storageSet: vi.fn(),
    pickProjects: vi.fn(async () => []),
    openFolder: vi.fn(),
    install: vi.fn(async () => null),
    remove: vi.fn(),
    boot: vi.fn(),
  };
  bridge.current = fake as unknown as PluginsBridge;
  return fake;
}

const entry = (id: string) => get(pluginHost.entries).find((e) => e.id === id)!;

beforeEach(() => {
  for (const id of [...pluginHost.running.keys()])
    void pluginHost.setEnabled(id, false);
  themeRegistry.reset();
  dialogRegistry.reset();
  notification.set(null);
  setAppBridge({
    recordChange: vi.fn(),
    playback: { seek: vi.fn(), play: vi.fn(), pause: vi.fn(), duration: 10 },
  });
});

describe("the plugin list", () => {
  it("shows every plugin with its state", async () => {
    fakeBridge([
      theme("pink"),
      { id: "broken", error: "plugin.json is invalid" },
      { id: "Old.ts", legacy: true, error: "old" },
      theme("bad-settings", { settings: [{ key: "a", type: "nope" }] }),
    ]);
    await pluginHost.refresh();
    expect(entry("pink")).toMatchObject({ status: "off", enabled: false });
    expect(entry("broken")).toMatchObject({
      status: "invalid",
      problem: "plugin.json is invalid",
    });
    expect(entry("Old.ts").status).toBe("legacy");
    expect(entry("bad-settings").problem).toMatch(/settings in plugin.json/);
  });

  it("fills settings with their defaults", async () => {
    fakeBridge(
      [
        theme("p", {
          settings: [
            { key: "speed", type: "number", label: "Speed", default: 3 },
          ],
        }),
      ],
      { p: { settings: { other: true } } },
    );
    await pluginHost.refresh();
    expect(entry("p").settings).toEqual({ speed: 3, other: true });
  });
});

describe("turning plugins on and off", () => {
  it("starts and stops a plugin, with its themes", async () => {
    const fake = fakeBridge([theme("pink")]);
    await pluginHost.refresh();
    await pluginHost.setEnabled("pink", true);
    expect(fake.setEnabled).toHaveBeenCalledWith("pink", true);
    expect(entry("pink").status).toBe("running");
    expect(get(themeRegistry).map((t) => t.name)).toEqual(["pink theme"]);

    await pluginHost.setEnabled("pink", false);
    expect(entry("pink").status).toBe("off");
    expect(get(themeRegistry)).toEqual([]);
  });

  it("asks before turning on a plugin that wants permissions", async () => {
    const fake = fakeBridge([theme("needy", { permissions: ["files.pick"] })]);
    await pluginHost.refresh();
    const turningOn = pluginHost.setEnabled("needy", true);
    await vi.waitFor(() => expect(get(dialogRegistry)).toHaveLength(1));
    const [dialog] = get(dialogRegistry);
    expect(dialog.props?.permissions).toEqual([
      expect.stringContaining("choose project files"),
    ]);
    (dialog.props!.onAllow as () => void)();
    await turningOn;
    expect(fake.setGrant).toHaveBeenCalled();
    expect(entry("needy").status).toBe("running");
  });

  it("does nothing when the user says no", async () => {
    const fake = fakeBridge([
      theme("needy", { dependencies: { three: "0.170.0" } }),
    ]);
    await pluginHost.refresh();
    const turningOn = pluginHost.setEnabled("needy", true);
    await vi.waitFor(() => expect(get(dialogRegistry)).toHaveLength(1));
    (get(dialogRegistry)[0].props!.onCancel as () => void)();
    await turningOn;
    expect(fake.setEnabled).not.toHaveBeenCalled();
    expect(fake.installDependencies).not.toHaveBeenCalled();
  });

  it("installs packages the user agreed to before starting", async () => {
    const listing = theme("pkgs", { dependencies: { three: "0.170.0" } });
    listing.dependenciesInstalled = false;
    const fake = fakeBridge([listing], {
      pkgs: {
        grant: '{"permissions":[],"dependencies":[["three","0.170.0"]]}',
      },
    });
    await pluginHost.refresh();
    await pluginHost.setEnabled("pkgs", true);
    expect(fake.installDependencies).toHaveBeenCalledWith("pkgs");
    expect(entry("pkgs").status).toBe("running");
  });

  it("shows why a plugin failed to start", async () => {
    const fake = fakeBridge([theme("bad")]);
    fake.load.mockRejectedValueOnce(new Error("main.ts:3: Expected ;"));
    await pluginHost.refresh();
    await pluginHost.setEnabled("bad", true);
    expect(entry("bad")).toMatchObject({
      status: "failed",
      problem: "main.ts:3: Expected ;",
    });
  });
});

describe("starting at launch", () => {
  it("loads nothing when no plugin is on", async () => {
    const fake = fakeBridge([theme("pink")]);
    await startPlugins({
      recordChange: vi.fn(),
      playback: { seek: vi.fn(), play: vi.fn(), pause: vi.fn(), duration: 0 },
    });
    expect(fake.anyEnabled).toHaveBeenCalled();
    expect(fake.list).not.toHaveBeenCalled();
  });

  it("starts the plugins that are on, inside a boot guard", async () => {
    const fake = fakeBridge([theme("a"), theme("b")], { a: { enabled: true } });
    await pluginHost.startEnabled();
    expect(fake.boot.mock.calls).toEqual([["start"], ["done"]]);
    expect(entry("a").status).toBe("running");
    expect(entry("b").status).toBe("off");
  });

  it("waits for the user after a launch that crashed while starting plugins", async () => {
    const fake = fakeBridge(
      [theme("a")],
      { a: { enabled: true } },
      { crashedDuringBoot: true },
    );
    await pluginHost.startEnabled();
    expect(fake.load).not.toHaveBeenCalled();
    const message = get(notification);
    expect(message?.message).toMatch(/weren't started/);
    message!.action!();
    await vi.waitFor(() => expect(entry("a").status).toBe("running"));
  });

  it("starts nothing in safe mode", async () => {
    const fake = fakeBridge(
      [theme("a")],
      { a: { enabled: true } },
      { safeMode: true },
    );
    await pluginHost.startEnabled();
    expect(fake.load).not.toHaveBeenCalled();
    expect(get(pluginHost.safeMode)).toBe(true);
  });

  it("holds back a plugin whose new version asks for more", async () => {
    fakeBridge([theme("needy", { permissions: ["project.write"] })], {
      needy: { enabled: true, grant: '{"permissions":[],"dependencies":[]}' },
    });
    await pluginHost.startEnabled();
    expect(entry("needy").status).toBe("needs-consent");
  });
});

describe("notifications from plugins", () => {
  it("shows toasts, but not too many", async () => {
    fakeBridge([theme("t")]);
    await pluginHost.refresh();
    await pluginHost.setEnabled("t", true);
    const plugin = pluginHost.running.get("t")!;
    pluginHost.handleNotify(plugin, "ui.toast", ["Hello", "success"]);
    expect(get(notification)).toMatchObject({
      message: "t: Hello",
      type: "success",
    });
    pluginHost.handleNotify(plugin, "ui.toast", ["Again", "nonsense"]);
    expect(get(notification)?.message).toBe("t: Hello");
  });

  it("moves the playhead in seconds", async () => {
    const seek = vi.fn();
    setAppBridge({
      recordChange: vi.fn(),
      playback: { seek, play: vi.fn(), pause: vi.fn(), duration: 20 },
    });
    fakeBridge([theme("t")]);
    await pluginHost.refresh();
    await pluginHost.setEnabled("t", true);
    const plugin = pluginHost.running.get("t")!;
    pluginHost.handleNotify(plugin, "playback.seek", [5]);
    expect(seek).toHaveBeenCalledWith(25);
    expect(() =>
      pluginHost.handleNotify(plugin, "playback.seek", ["soon"]),
    ).toThrow();
    expect(() =>
      pluginHost.handleNotify(plugin, "views.post", ["nope", {}]),
    ).toThrow(/no view called/);
    expect(() => pluginHost.handleNotify(plugin, "launchMissiles", [])).toThrow(
      /Unknown/,
    );
  });

  it("records errors and says when a plugin was stopped", async () => {
    fakeBridge([theme("t")]);
    await pluginHost.refresh();
    await pluginHost.setEnabled("t", true);
    const plugin = pluginHost.running.get("t")!;
    pluginHost.onError("t", "it broke");
    expect(entry("t").log).toEqual([{ level: "error", text: "it broke" }]);
    pluginHost.handleNotify(plugin, "log", ["warn", "careful"]);
    expect(entry("t").log.at(-1)).toEqual({ level: "warn", text: "careful" });
    plugin.stop("paused");
    expect(entry("t").status).toBe("paused");
    expect(get(notification)?.message).toMatch(/kept failing/);
    expect(pluginHost.running.has("t")).toBe(false);
  });
});
