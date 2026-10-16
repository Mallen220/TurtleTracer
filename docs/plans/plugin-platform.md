# Plugin Platform v2: Plan

Status: approved 2026-10-15 with the owner's decisions in §11; being built on
`feature/plugin-platform`. See §12 for progress.

## 1. Summary

Today a plugin is one `.ts`/`.js` file. It runs inside the app window through
`new Function` and is handed the app's internals: writable stores, registries
of Svelte components, and the raw Two.js scene. That gives plugins a lot of
reach, but only by accident. It isn't safe, and it breaks easily. A plugin can
do anything the app can, including writing any file on disk, and whatever it
gets wrong happens on our UI thread.

The plan is to run plugins outside the app. Their logic runs in a Web Worker
and their rich UI in sandboxed iframes. They reach the app only through a
narrow, typed message protocol, and the app checks every message.

The app offers **contribution points**: action types, event-marker types,
exporters, field layers, field views, simulators, commands, settings and
themes. Built-in features register through the same registries, so core code
deals with "an action type" or "a field layer" and doesn't care who supplied
it. Everything a plugin returns is validated, every call has a time limit, and
a plugin that misbehaves gets paused. It can't take the app down with it.

## 2. What exists today

| Area                 | Today                                                                                                                                                                                      | Problem                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loader               | `src/lib/pluginManager.ts` runs plugin code with `new Function` in the main window and "shadows" `window`, `document`, `electronAPI` and others by passing them as `undefined` parameters. | This isn't a sandbox. `Function("return this")()` returns the real global object. Checked on 2026-10-15: plugin code reaches `electronAPI.writeFile`, which accepts any absolute path (`validateArbitraryPath` in `electron/utils.js`). A plugin can write any file, which means it can run code on the user's machine. It can also call `githubFetch` with the user's token. |
| API surface          | `turtle.stores` (writable project and app stores), `turtle.registries` (Svelte components, hooks) and the raw Two instance.                                                                | Plugins can corrupt state and get around undo. They also depend on internals, so every refactor breaks them.                                                                                                                                                                                                                                                                  |
| Crash safety         | `try/catch` around synchronous calls.                                                                                                                                                      | An infinite loop in a plugin freezes the app. Errors in async plugin code aren't caught. The only way to stop a bad plugin is to delete its file.                                                                                                                                                                                                                             |
| Bundled Sticky Notes | Checks for `document` and `globalThis`.                                                                                                                                                    | Both are shadowed to `undefined`, so `isDomAvailable()` is always false and it retries every 500 ms forever. **It never starts.**                                                                                                                                                                                                                                             |
| Unloading            | `reloadPlugins()` resets _every_ registry, then calls `registerCoreUI()`.                                                                                                                  | Fragile: core state depends on that reset-and-reregister dance.                                                                                                                                                                                                                                                                                                               |
| Field drawing        | Plugins draw straight into the Two.js scene through `fn(two)`, on every playback frame.                                                                                                    | Nothing stops a plugin from breaking our layers, and plugins are tied to Two.js for good.                                                                                                                                                                                                                                                                                     |
| Action types         | `actionRegistry` exists. The timeline (`pathCalculator.ts:220`) and the sequential exporter (`sequentialExporter.ts:105`) already dispatch through it.                                     | About 224 hardcoded `kind === "path" / "wait" / …` checks in about 45 files. Each action type also needs Svelte components, which a sandboxed plugin can't supply.                                                                                                                                                                                                            |

Seams worth keeping:

- the `actionRegistry` dispatch in the timeline and the exporters
- `exporterRegistry`
- trace-based pose interpolation for recovery events (`robotPoseDuring` in `src/utils/animation.ts`)
- `extraData` in project files
- the telemetry overlay primitives (`FieldOperation`)
- `sanitizeSequence`, which already keeps item kinds it doesn't know
- DOMPurify, which is already a dependency

## 3. Goals and non-goals

**Goals**

- Plugins can change large parts of the app: other field views (3D), robot
  simulation, many paths at once, new action types, new event-marker types and
  new exporters, plus commands, panels, settings and themes.
- Security by design. A plugin can do only what the API offers and the user
  has approved.
- A broken or hostile plugin can't crash or freeze the app, and it can't
  corrupt the project.
- Core code stays readable. Plugin plumbing lives in one folder, behind
  registries the core already understands.

**Non-goals for this effort**

- A plugin marketplace, remote install or code signing.
- Plugins in the web build. **Never**: plugins are a desktop-only feature by
  design, and the code is free to rely on Electron (a custom protocol, bundling
  in the main process).
- Letting plugins swap out core components such as the Navbar or
  FieldRenderer. Plugins add to the app; they don't replace parts of it. For
  example, a 3D view sits next to the 2D editor and doesn't replace it.

## 4. Architecture

```
┌────────────────────────── App window (trusted) ───────────────────────────┐
│                                                                           │
│  Svelte UI ──reads──▶ contribution registries ◀──registers── PluginHost   │
│  (core + plugin       (actions, exporters, layers,           one per      │
│   entries alike)       views, commands, …)                   plugin       │
│                                                      validate · permit ·  │
│                                                      time-limit · pause   │
│                                                              │  ▲         │
│                                                  MessagePort │  │         │
│                                                              ▼  │         │
│  FieldStage ─┬─ 2D FieldRenderer                    ┌──────────────────┐  │
│              └─ <iframe sandbox> plugin view ◀────▶ │ Worker: main.ts  │  │
│                 turtle-plugin://field-3d/…          │ (no DOM, no net) │  │
│                                                     └──────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   │ IPC (narrow, validated)
     Electron main: lists and reads plugin files, serves turtle-plugin://, network proxy
```

### 4.1 Plugin package

A plugin is either a folder with a manifest or, as now, a single file:

```
plugins/
  csv-export.ts              ← single-file plugin (still supported)
  field-3d/
    plugin.json
    main.ts                  ← logic, runs in a worker (optional)
    view/index.html          ← sandboxed view (optional)
    view/app.js
    assets/field.glb
```

```jsonc
// plugin.json
{
  "id": "field-3d", // [a-z0-9-]+, must match the folder name
  "name": "3D Field",
  "version": "1.0.0",
  "apiVersion": 2, // the app refuses versions it doesn't support
  "description": "View the field and robot in 3D.",
  "author": "…",
  "main": "main.ts",
  "views": {
    "field3d": { "entry": "view/index.html", "slot": "field", "title": "3D" },
  },
  "permissions": [],
}
```

Plugins are folders. The old single-file format is gone (there is no v1
compatibility, §11): old files in the plugins folder are listed as "old
format" and not run, and unmodified copies of our old bundled files are
removed.

**npm packages.** A manifest can list `dependencies` (`{ "three": "0.170.0" }`).
When the user turns the plugin on, the consent dialog lists them; once
accepted, the main process downloads them from registry.npmjs.org, checks
each tarball's integrity hash, extracts it into the plugin's `node_modules`
and never runs install scripts. Packages run inside the plugin's sandbox like
the rest of its code.

**Bundling.** The main process bundles each script with esbuild-wasm (it
replaces `typescript` as a runtime dependency, so the app gets smaller): the
worker entry into one classic script, and every script a view requests into
one ES module. Authors write TypeScript, import npm packages and never run a
build step. Imports that resolve outside the plugin folder are rejected.

### 4.2 Logic runs in a Web Worker

- There's one dedicated worker per plugin. It runs on its own thread, so a
  busy or looping plugin never blocks the UI, and `worker.terminate()` stops it
  at once.
- A worker has no DOM, no `window` and no `electronAPI` (preload APIs aren't
  exposed in workers), and it shares no memory with the app.
- The worker starts from a bootstrap script the app owns
  (`src/lib/plugins/runtime/`). Express serves that script with its own
  Content-Security-Policy header: `default-src 'none'; script-src 'self' blob:`.
  The policy blocks `fetch`, `import("https://…")` and `importScripts` of
  remote URLs.
- As a second layer, before plugin code runs the bootstrap deletes the
  network, storage and worker globals: `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `indexedDB`, `caches`, `BroadcastChannel` and `Worker`. It
  also freezes the `turtle` API object.
- Plugin code is loaded as a blob URL through `importScripts`, so nothing runs
  through `eval`. It was bundled by esbuild-wasm in the main process.
- Nothing secret ever enters the worker. Its project snapshot leaves out file
  paths, recent files and tokens.

### 4.3 Views run in sandboxed iframes

These are for UI that needs a real DOM, a canvas or WebGL: the 3D field,
custom panels, complex dialogs.

- The iframe is `<iframe sandbox="allow-scripts" src="turtle-plugin://<id>/view/index.html">`.
  Without `allow-same-origin` its origin is opaque, so it can't touch the
  parent, storage or cookies. Without `allow-top-navigation` or
  `allow-popups`, it can't navigate the app or open windows.
- `turtle-plugin://` is a custom protocol registered in the Electron main
  process. It serves only files inside that plugin's own folder, and checks
  that with `realpath`. Each plugin gets its own host, and so its own origin.
  Responses carry a strict CSP: no network, and scripts and images only from
  the plugin and from `blob:`. They also carry CORS headers so module scripts
  load.
- The view talks only over a `MessagePort` the host hands it. The host
  accepts messages only from `iframe.contentWindow`.
- An iframe on another origin should run in its own process under Electron's
  site isolation, so a hung view can't freeze the app. The spike in §10 checks
  this. Either way, a heartbeat replaces a dead view with a "stopped
  responding" card and a reload button.
- The protocol serves a small client at `/__turtle/view.js`, so view code
  looks like this:

```js
import { connect } from "/__turtle/view.js";
const turtle = await connect();
turtle.onScene((scene) => rebuild(scene)); // field, paths, robot size, shapes…
turtle.onFrame(({ time, pose }) => moveRobot(pose));
turtle.seek(3.2); // intents go back to the app
```

### 4.4 The protocol

- Message types are `call`, `result` and `event`, each with an id.
- Functions never cross the boundary. When a plugin registers something with
  callbacks, the runtime keeps the functions in a table and sends descriptors
  holding callback handles. The host later calls `invoke(handle, args)`.
- `PluginConnection` on the host side wraps the port and enforces, for every
  message:
  - a per-call timeout
  - a payload size cap
  - a rate limit
  - schema validation (see §4.6)
- Results are copied into fresh objects with only the keys we know, so a
  `__proto__` key can't pollute prototypes.
- The host keeps a filtered `ProjectSnapshot` mirrored in the worker,
  debounced to about 50 ms. That lets plugins read the project synchronously
  with `turtle.project.get()`, so most plugin code needs no `await`.
- The host supplies a sampled pose track for the current plan, every 20 ms,
  built from the app's own timing. Simulators, 3D views and ghost robots all
  use it, so none of them re-implement Pedro timing.

### 4.5 Permissions

| Permission        | Grants                                                                                                                                                                                                 | Asked?                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| _(baseline)_      | Read the open project (points, paths, sequence, shapes, robot and field settings, timeline). Add UI contributions. Read and write the plugin's own project data, its own storage and its own settings. | No; shown in the plugin details |
| `project.write`   | Edit core project data (paths, points, shapes, items of any kind) through undoable operations.                                                                                                         | Yes                             |
| `files.pick`      | Ask the user to pick files to open. The app shows the dialog, and the plugin gets only the files the user chose.                                                                                       | Yes                             |
| `network:<host>`  | `turtle.net.fetch` to the listed hosts only, through the main process.                                                                                                                                 | Yes, with the host list shown   |
| `clipboard.write` | Write text to the clipboard.                                                                                                                                                                           | Yes                             |

Turning a plugin on for the first time shows what it asks for. Grants are
stored per plugin id together with a hash of the permission list, so a newer
version that asks for more asks again.

### 4.6 Failure containment

- **Thread isolation.** A worker hang never blocks the UI. Every 2 s the host
  sends a heartbeat; a worker that misses replies for 5 s is terminated and
  marked "Not responding", with a Restart button.
- **Time budgets per call.**

  | Call             | Budget | If it runs over                               |
  | ---------------- | ------ | --------------------------------------------- |
  | Field layer draw | 100 ms | the last good result stays on screen          |
  | Timing           | 500 ms |                                               |
  | Export           | 15 s   |                                               |
  | Simulation       | none   | it shows progress, and the user can cancel it |

- **Validated results.** Coordinates must be finite numbers, and sizes are
  capped:
  - 5,000 primitives per layer
  - 200,000 samples per track
  - 64 form fields
  - 1 MB payload by default

  A result that fails these checks is dropped and logged against the plugin.

- **Circuit breaker.** Five errors in 30 s pause the plugin, with a toast:
  "Plugin X was paused after repeated errors". It can be restarted from the
  plugin manager.
- **Render isolation.** Host components that render plugin data sit inside
  `<svelte:boundary>` (Svelte 5.55 supports it), so a render error shows a
  small error card in place of a broken screen.
- **Projects keep plugin data when the plugin is missing.** Its items still
  load and save, and they show as placeholder rows ("Intake: plugin
  _intake-action_ isn't installed"). They take no time in the timeline, and
  exports get a `// Skipped …` comment. A missing plugin never stops a project
  from opening.
- **Safe mode.** A flag is set while plugins start and cleared once startup
  succeeds. If the app crashes or hangs during plugin startup, the next launch
  offers to start with plugins off. There's also a `--safe-mode` flag and a
  "Restart with plugins disabled" menu item.
- **Edits are visible.** Plugin edits go through history as one undo step
  each, labeled with the plugin's name.

### 4.7 Keeping the core clean

- **One folder.** Everything for plugins lives under `src/lib/plugins/`:

  ```
  src/lib/plugins/
    index.ts            ← the only thing core code imports (facade)
    api/                ← public plugin API types → generates plugins/turtle.d.ts
    protocol/           ← message types + validators (shared by host and runtime)
    runtime/            ← worker bootstrap, builds `turtle` (imports protocol/ and api/ only)
    host/               ← PluginHost, PluginConnection, loader, permissions, safe mode, state
    contributions/      ← one adapter per capability: plugin descriptor → core registry entry
    ui/                 ← SchemaForm, PluginView (iframe), placeholders, consent dialog
  ```

- **Lint rule.** An ESLint `no-restricted-imports` rule enforces the
  boundary. Core code may import only `src/lib/plugins/index.ts`, and
  `runtime/` may not import app code.
- **Registries know who owns each entry** (`"core"` or a plugin id).
  `removeOwner(id)` unloads exactly one plugin's contributions. Core entries
  are never reset, so `registerCoreUI()`-after-reset goes away.
- **One registry factory.** The tab, navbar, context-menu and dialog
  registries are copies of each other today; one `createRegistry<T>()`
  replaces them.
- **Core never says "plugin"** outside the facade. An action type from a
  plugin is a normal `ActionDefinition` whose functions happen to call the
  contribution adapter.
- **A smaller public API.** `plugins/turtle.d.ts` is generated from `api/`
  only. Today it's a dump of all of `src/types/index.ts`, which makes every
  internal type part of the plugin API.
- `pluginManager.ts` (585 lines, with Two.js drawing inline) is replaced by
  small modules, each with one job.

## 5. Capabilities

Each section gives the plugin-side API, what the host does, and the core
files it touches. The plugin-side snippets are meant to show how readable
plugins should be.

### 5.1 UI: commands, buttons, menus, dialogs, settings, storage

```ts
turtle.commands.register({ id: "add-note", title: "Add sticky note", keybinding: "alt+n",
  run: (args) => addNote(args?.field ?? turtle.view.center()) });
turtle.ui.navbar.add({ command: "add-note", icon: noteSvg });
turtle.ui.contextMenu.field.add({ command: "add-note", label: "Add sticky note" }); // gets { field: {x, y} }
turtle.ui.sidebar.add({ command: "add-note", icon: noteSvg });

const name = await turtle.ui.prompt({ title: "Rename", defaultText: "Note" });
const values = await turtle.ui.form({ title: "Intake", fields: [...] });    // declarative form dialog
turtle.ui.toast("Saved", "success");

turtle.settings.define([{ key: "noteColor", type: "color", label: "Note colour", default: "#fde68a" }]);
turtle.settings.get().noteColor;
await turtle.storage.set("lastUsed", Date.now());     // per plugin, app-wide, size-capped
```

**Declarative forms.** Plugins describe forms as data, and the host renders
them with `SchemaForm.svelte` using the existing inputs and `ui.ts` presets.
This form schema is used everywhere: action rows, marker settings, exporter
options, plugin settings and form dialogs.

Field types: `number`, `text`, `toggle`, `select`, `color`, `point` and
`heading`. A `number` field can take `unit: "distance" | "angle" | "time" | "speed"`,
and then the host shows units and converts between metric and imperial for
the plugin.

Plugins get consistent, themable, accessible UI without shipping any. Themes
keep working because the presets use the same class names.

**Icons** are SVG strings cleaned with DOMPurify's SVG profile.

**Core files touched:** CommandPalette, keybindings config,
`LeftSidebar.svelte`, `Navbar.svelte`, `FieldContextMenuBuilder.ts`,
`SettingsDialog` (new "Plugins" tab), and `DialogHost` (plugin dialogs
become host-owned `SchemaForm`, prompt or confirm dialogs).

### 5.2 Project data and editing

```ts
const project = turtle.project.get(); // synchronous, from the mirror
turtle.events.on("project:changed", redraw);

turtle.project.data.get(); // this plugin's slot: extraData.plugins["<id>"]
await turtle.project.data.set({ notes });

await turtle.project.edit("Spread waypoints", [
  // needs project.write for core data
  { op: "movePoint", lineId, x: 48, y: 30 },
  {
    op: "insertItem",
    index: 3,
    item: { type: "intake", data: { durationMs: 500 } },
  },
]);
```

The first set of operations: `insertItem`, `updateItem`, `removeItem`,
`setData`, `movePoint`, `updateLine` (a limited set of fields), and
`addShape` / `updateShape` / `removeShape`.

Each operation is checked against the schema and the plugin's permissions,
and a whole batch is applied as one history entry. A list of explicit
operations is easier to check and review than letting plugins hand back a
whole edited project.

**Core files touched:** `projectStore.ts` (an apply-operations function) and
the history recording in `App.svelte`, through `onRecordChange`.

### 5.3 Field overlay layers, tracks and handles

```ts
const layer = turtle.field.addLayer({
  name: "zones",
  draw: ({ project }) => [
    { type: "polygon", points: zone, fill: "#ef444433", stroke: "#ef4444", id: "red-zone" },
    { type: "text", x: 20, y: 130, text: "Red zone", size: 12 },
    { type: "rect", x: -6, y: -6, width: 12, height: 4, space: "robot", fill: "#f59e0b" }, // rides on the robot
    { type: "robot", track: "sim", color: "#64748b", opacity: 0.6 },                        // ghost along a track
    { type: "handle", id: "zone-corner-1", x: 10, y: 120 },                                 // draggable
  ],
  onClick: (id) => …, onHandleMoved: (id, x, y) => …,
});
turtle.field.setTrack("sim", { t, x, y, heading });   // upload once; the host follows it during playback
layer.redraw();
```

- The primitives are `circle`, `rect`, `polyline`/`polygon`, `text`, `arrow`,
  `robot` and `handle`. Coordinates are field inches.
- `space: "robot"` primitives are moved with the robot every frame by the
  host, with no round trip to the plugin.
- `track` primitives are interpolated by the host every frame from a track
  uploaded once. Ghost robots and anything else that follows the playhead get
  60 fps motion with no messages per frame.
- The host calls `draw` again only when the project changes or `redraw()` is
  called.

**Core files touched:**

- `FieldSceneRenderer.ts`: adds a `plugin-group` layer to `FIELD_LAYERS` and
  removes the `fn(two)` path.
- New `renderer/PluginLayerGenerator.ts`, which turns primitives into Two.js
  shapes and shares drawing code with the telemetry `FieldOperation` layer.
- `RobotOverlay.svelte`, which takes a list of ghost robots (telemetry,
  simulators, tracks) in place of the single telemetry ghost.
- `FieldInteractionController.ts`, which handles clicks and dragging handles
  for plugin elements.

### 5.4 Field views (the 3D field)

The manifest declares the view: `"views": { "field3d": { "entry": "view/index.html", "slot": "field", "title": "3D" } }`.

- **The switch.** A new `FieldStage.svelte` holds the 2D `FieldRenderer`, and
  a segmented "2D | 3D" switch appears with the zoom controls. Choosing "3D"
  mounts the iframe in the field area. Editing stays in 2D in v1. Playback
  controls, the timeline and the sidebar keep working, since they drive the
  same playhead.
- **Scene message**, sent whenever the scene changes:

  ```ts
  interface FieldScene {
    field: { width: number; height: number; image?: Blob }; // Blob → the view makes a blob: URL
    robot: { length: number; width: number };
    paths: {
      id: string;
      color: string;
      samples: { x: number; y: number; heading: number }[];
      waypoints: { x: number; y: number }[];
      selected: boolean;
    }[];
    shapes: {
      id: string;
      kind: "obstacle" | "keep-in";
      vertices: { x: number; y: number }[];
    }[];
    markers: { id: string; name: string; x: number; y: number }[];
    plan: { t: number[]; x: number[]; y: number[]; heading: number[] }; // sampled poses
    duration: number;
    units: "imperial" | "metric";
    theme: "light" | "dark";
  }
  ```

- **Frame messages**, sent every animation frame while playing or scrubbing:
  `{ time, percent, pose: { x, y, heading }, playing }`.
- **Intents** the view can send back: `seek(t)`, `play()`, `pause()`,
  `select({ kind, id })`, and `edit(ops)` if it has `project.write`.
- **Other slots** use the same mechanism. `"panel"` adds a tab in
  ControlTab, and `"dialog"` opens a modal.

How the concept in the referenced commit maps onto this:

| In the commit                | In this design                                                     |
| ---------------------------- | ------------------------------------------------------------------ |
| "3D" toolbar button          | field view switch                                                  |
| arena GLB                    | a file in the plugin's own `assets/`, served by `turtle-plugin://` |
| path line with dots          | `scene.paths`                                                      |
| robot box following playback | `frame.pose` and `scene.robot`                                     |
| threlte / three.js           | bundled inside the plugin; the app gains no 3D dependency          |

**Core files touched:** new `FieldStage.svelte` (`App.svelte` swaps
`FieldRenderer` for it), new `plugins/ui/PluginView.svelte`, `FieldZoomControls`
(the switch), and in `electron/main.js` the protocol handler.

### 5.5 Action types

```ts
turtle.actions.register({
  name: "intake", // saved as type "intake-action.intake"
  label: "Intake",
  color: "#16a34a",
  icon: intakeSvg,
  fields: [
    {
      key: "durationMs",
      type: "number",
      unit: "time",
      label: "Run for",
      default: 800,
    },
    {
      key: "power",
      type: "number",
      label: "Power",
      min: 0,
      max: 1,
      step: 0.05,
      default: 1,
    },
  ],
  timing: { durationFrom: "durationMs" }, // the app times it; no round trip
  code: {
    sequential: ({ data }) =>
      `new IntakeCommand(intake, ${data.power}).withTimeout(${data.durationMs})`,
    java: ({ data, step }) => ({
      code: `case ${step}: intake.run(${data.power}); …`,
      steps: 2,
    }),
  },
});
```

- **Saved shape.** Items are saved as
  `{ kind: "plugin", type: "intake-action.intake", id, name, data, locked?, hidden?, eventMarkers? }`.
  All plugin items share one `kind`, which keeps the `SequenceItem` union
  closed. Core code checks `kind === "plugin"` and never needs plugin names.
- **Lookup.** One helper, `actionFor(item)`, finds the definition. When the
  plugin is missing, it returns a `MissingPluginAction` (see §4.6).
- **Timing.** There are three tiers, and the timeline stays synchronous in
  all of them:
  1. _Declarative._ A fixed duration, a duration from a field, or a turn to a
     heading from a field. The app computes these itself, with no messages.
     Most actions only need this.
  2. _Callback._ `time({ item, start, settings }) → { duration, endHeading?, endPose?, trace? }`.
     The result is fetched asynchronously and cached by the item's data, its
     start pose and the relevant settings. Until a fresh result arrives, the
     last result for the same item stands in (stale-while-revalidate), so
     dragging doesn't flicker. When it arrives, the host bumps a store and the
     timeline recomputes.
  3. _Moving actions_ return a `trace` (a list of poses over time). The
     timeline turns it into an event with a trace. `robotPoseDuring` already
     follows traces for recovery events; it only needs to do so for any
     event.
- **Table rows and sections** use generic `PluginActionRow.svelte` and
  `PluginActionSection.svelte`, which render `SchemaForm` from the action's
  `fields`. Add buttons accept hex colours as well as Tailwind colour names.
- **Field marker.** The host draws the usual stationary marker (from
  `stationaryMarkers.ts`) in the plugin's colour, and an optional `drawField`
  can return primitives.
- **Code export.** Before an export runs, `prepareExport()` fetches the code
  for every plugin item at once, without waiting on each in turn. The
  existing synchronous exporters then read those results from their context.
  An item that fails gets a comment in the code plus a toast.
- **Core files touched:**
  - `src/types/index.ts`: `SequencePluginItem`, and `RecoveryTrace`
    generalized to `PoseTrace`
  - `actionRegistry.ts`
  - new `sequenceItems.ts` with `itemKey(item)` and `isPathItem`
  - `animation.ts`
  - `WaypointTable.svelte`, `PathTab.svelte`, `PathActionButtons.svelte`,
    `InsertAfterBar.svelte`
  - an audit of `clipboard.ts`, `selection.ts`, `sequenceOperations.ts`,
    `macroUtils.ts` and `pathStatistics.ts`, fixing only the places where a
    plugin item would be mishandled (no blanket sweep)
  - `javaExporter.ts` and `sequentialExporter.ts`

### 5.6 Event-marker types

```ts
turtle.markers.register({
  name: "zone-enter",
  label: "When entering zone",
  fields: [{ key: "zone", type: "select", label: "Zone", options: "shapes" }],
  // When, within its step, the marker fires.
  resolve: ({ marker, poses, shapes }) => ({ time: firstTimeInside(poses, shapes[marker.parameters.zone]) }),
  code: { sequential: … },                          // optional
});
```

- **Saved shape.** Markers are saved with `type: "plugin"`,
  `pluginType: "zones.zone-enter"`, and the existing `parameters` field.
- **Resolving to a built-in trigger.** The host turns the time a marker
  resolves to into a parametric position on its line, so it's drawn and
  exported as an ordinary parametric marker. Plugin marker types work with
  every exporter for free unless they supply their own `code`.
- **Built-in types move to the same registry.** parametric, temporal and pose
  become entries in a new `markerTypeRegistry`. That replaces the type
  branches in `GlobalEventMarkers.svelte`, `EventMarkerGenerator.ts`,
  `eventMarkerUtils.ts` and `FieldDragHandler.ts`.

### 5.7 Exporters

```ts
turtle.exporters.register({
  name: "csv",
  label: "CSV poses",
  language: "plaintext",
  extension: "csv",
  options: [
    {
      key: "rate",
      type: "number",
      unit: "time",
      label: "Sample every",
      default: 50,
    },
  ],
  export: ({ project, plan, options }) => ({
    files: [{ name: "auto.csv", content: toCsv(plan, options.rate) }],
  }),
});
```

- Plugin exporters show in the export dialog and the Code tab next to the
  built-in ones. The options form comes from `SchemaForm`, and saving goes
  through the host's save dialog.
- An exporter can return one string or several files.
- `customExportersStore` goes away. `exporterRegistry` becomes the one list of
  exporters.
- Importers (`turtle.importers`) would follow the same pattern. They're
  listed under Phase 5 as optional.

### 5.8 Robot simulators

```ts
turtle.simulators.register({
  name: "pd-follower",
  label: "PD follower with friction",
  settings: [
    { key: "massKg", type: "number", label: "Mass (kg)", default: 12 },
  ],
  async simulate({ plan, robot, shapes, settings }, { progress, signal }) {
    // plan: the app's planned poses every 20 ms. Return what the "real" robot does.
    return {
      t,
      x,
      y,
      heading,
      notes: [{ t: 2.1, text: "Wheel slip", level: "warning" }],
    };
  },
});
```

- **Where it shows.** A "Simulation" picker sits in the playback controls,
  with "Planned (built-in)" or any plugin simulator.
- **Running.** A run is checked (time must increase, values must be finite,
  sizes are capped). It's debounced to 300 ms after edits, and an edit cancels
  the run in progress through `signal`.
- **Showing the result.** It plays as a ghost robot next to the planned robot,
  or, in "drive with simulation" mode, it takes over as the robot's pose
  during playback. A `PoseSource` abstraction in the animation code handles
  this.
- **Comparison.** The host computes the deviation from the plan itself (max,
  mean, worst moment), the same way for every simulator.
- **Notes** show as markers on the timeline.

**Core files touched:** `animation.ts` and `playback.svelte.ts`
(`PoseSource`), `PlaybackControls.svelte`, `RobotOverlay.svelte`.

### 5.9 Several paths at once

```ts
turtle.commands.register({
  id: "compare-autos",
  title: "Show other autos…",
  async run() {
    for (const file of await turtle.files.pickProjects({ multiple: true })) {
      // files.pick
      const other = await turtle.projects.analyze(file.project); // the app's own timing
      turtle.field.setTrack(file.name, other.plan);
      autos.set(file.name, other.paths);
    }
    layer.redraw();
  },
});
const layer = turtle.field.addLayer({
  name: "other-autos",
  draw: () =>
    [...autos].flatMap(([name, paths]) => [
      ...paths.map((p) => ({
        type: "polyline",
        points: p.samples,
        stroke: p.color,
        dash: [4, 4],
        opacity: 0.7,
      })),
      { type: "robot", track: name, color: "#64748b", opacity: 0.6 },
    ]),
});
```

- `pickProjects` shows the open dialog in the main process. It returns parsed,
  validated project data, never file paths.
- `projects.analyze` runs the app's own normalization and time calculator on
  that data. Plugins never re-implement path timing.
- Ghost robots stay in step with playback through `track`.

### 5.10 App events

`turtle.events.on(name, cb)` for these events:

- `project:changed`
- `project:loaded`
- `project:saved`
- `selection:changed`
- `playback:frame` (at most 30 Hz for workers)
- `theme:changed`

There's no veto-style `beforeSave` hook. A plugin must never be able to block
saving.

### 5.11 Themes

`turtle.registerTheme(name, css)` stays. The CSS is cleaned: `@import` is
removed, `url()` is allowed only for `data:` and the plugin's own origin, and
size is capped. Theme CSS stays a `<style>` tag in the app, which is the one
place plugin output styles our DOM directly. The existing themes (`ui.ts`
presets matching class names) keep working.

## 6. Core changes by file

| File                                                                                                 | Change                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/pluginManager.ts`, `src/lib/pluginsStore.ts`                                                | Replaced by `src/lib/plugins/host/*`                                                                                                        |
| `src/lib/registries.ts`                                                                              | One `createRegistry<T>()` that records owners. `componentRegistry` removed: it exists only so plugins can swap out core components          |
| `src/lib/coreRegistrations.ts`                                                                       | Registers with owner `"core"` once; no more reset and re-register                                                                           |
| `src/types/index.ts`                                                                                 | `SequencePluginItem`; `PoseTrace`; plugin `EventMarker` type. Plugin API types move to `src/lib/plugins/api/`                               |
| `src/lib/actionRegistry.ts`, new `src/lib/sequenceItems.ts`                                          | `actionFor(item)`, `itemKey(item)`                                                                                                          |
| `src/utils/animation.ts`, `src/lib/playback.svelte.ts`                                               | Traces for any event; `PoseSource`                                                                                                          |
| `renderer/FieldSceneRenderer.ts`, new `renderer/PluginLayerGenerator.ts`                             | `plugin-group` layer from validated primitives                                                                                              |
| New `components/FieldStage.svelte`; `App.svelte`                                                     | 2D or plugin view switch                                                                                                                    |
| `renderer/RobotOverlay.svelte`                                                                       | A list of ghost robots                                                                                                                      |
| `WaypointTable`, `PathTab`, `PathActionButtons`, `InsertAfterBar`                                    | Generic plugin rows and sections; hex button colours                                                                                        |
| `clipboard.ts`, `selection.ts`, `sequenceOperations.ts`, `macroUtils.ts`, `pathStatistics.ts`        | Audit only, fixing places that mishandle plugin items                                                                                       |
| `exporters/*`                                                                                        | `prepareExport()`; fragments from context; comments for missing plugins                                                                     |
| `GlobalEventMarkers.svelte`, `EventMarkerGenerator.ts`, `eventMarkerUtils.ts`, `FieldDragHandler.ts` | `markerTypeRegistry`                                                                                                                        |
| `Navbar.svelte`, `CodeTab.svelte`, `ExportCodeDialog.svelte`                                         | Read `exporterRegistry` only                                                                                                                |
| `SettingsDialog`, CommandPalette, keybindings, `LeftSidebar`                                         | Plugin settings tab; registered commands                                                                                                    |
| `PluginManagerDialog.svelte`                                                                         | Status (running / paused / crashed / needs permission / incompatible), permissions, recent errors, reload, open folder, install from folder |
| `electron/ipc/pluginHandlers.js`                                                                     | List folder and file plugins with manifests; read assets (realpath containment); network proxy with allowlist; watch the folder for changes |
| `electron/main.js`                                                                                   | `turtle-plugin://` protocol; CSP header for the worker bootstrap; safe-mode flag                                                            |
| `electron/preload.js`                                                                                | New plugin IPC calls. Only app code can reach them, never plugins                                                                           |
| `scripts/generate-plugin-types.js`                                                                   | Generates from `src/lib/plugins/api/`                                                                                                       |
| `plugins/`                                                                                           | Bundled plugins ported, plus examples                                                                                                       |

## 7. Compatibility and migration (superseded: no v1 shim, see §11)

- **Supported through a shim in the worker runtime** (the documented v1
  calls):
  - `registerMetadata`, `registerTheme`, `registerExporter`
  - `registerFeature`, covering `navbar`, `contextMenu` and `render`;
    `drawRect`, `drawCircle`, `drawLine` and `drawText` map one-to-one onto
    primitives
  - `getData()` (synchronous, from the mirror)
  - `ui.prompt`, `ui.confirm`, `ui.toast`
  - `graphics.requestRedraw`
- **Not supported:** `turtle.stores`, `turtle.registries` and `ctx.two`.
  These hand out Svelte stores, Svelte components and the live scene, and a
  sandbox can't offer them. A plugin that uses them loads with a clear error
  linking to the migration guide.
- **Bundled plugins:**
  - Pink and Solarized themes: unchanged.
  - CSV exporter: ported to the v2 exporter, with options.
  - Sticky Notes: rewritten on overlay layers, handles, `ui.prompt` and
    project data. That also fixes the bug where it never starts. Its notes
    move from `extraData.stickyNotes` to its plugin slot the first time it
    loads them.
- `localStorage` `plugin_enabled_<file>` keys are migrated to the new state
  store.

## 8. Testing

- **Unit tests (vitest):**
  - manifest parsing and validation
  - permission checks for each API
  - `PluginConnection` timeouts, size caps, rate limits and heartbeat
  - the circuit breaker
  - safe-mode flag handling
  - schema validators (with fast-check fuzzing, which is already a
    dependency)
  - each contribution adapter
  - `PluginLayerGenerator`
  - edit operations, including undo and permission checks
  - export pre-resolution
- **Runtime without a real worker.** The worker runtime runs in-process over a
  `MessageChannel` transport in Node, so the whole host ⇄ runtime path is
  tested under vitest.
- **Projects with missing plugins:** save and load round trips with plugin
  items and markers present, and with their plugin missing (placeholder rows,
  zero time, export comments, data saved byte-for-byte).
- **Timeline tests:** declarative timing, callback timing with a stale cache,
  and moving actions with traces.
- **Hostile plugin fixtures** (`src/tests/fixtures/plugins/hostile/`). For
  each, the test checks that the app state is unchanged and the plugin is
  paused or reported:
  - an infinite loop at load and inside callbacks
  - throwing everywhere
  - huge or `NaN` output
  - `__proto__` payloads
  - message floods
  - attempts to reach `fetch`, `import()`, `importScripts`, `electronAPI`,
    `parent` and `top`
- **In a real browser.** Playwright (there's already `e2e/boot.spec.ts`), or
  headless Chrome against `vite preview` as we already do for UI smoke tests,
  with the worker bootstrap's CSP header set in `vite.config.ts`. These check
  that the real worker sandbox blocks network and imports, and that the
  example plugins work end to end.
- **Electron-only paths.** The `turtle-plugin://` protocol and process
  isolation of iframes get unit tests for path containment
  (`electron/ipc/*.test.js` style), plus a scripted manual check recorded in
  this doc.
- **Example plugins as acceptance tests**, one per requested capability:
  `field-3d`, `robot-sim`, `multi-path`, `intake-action`, `zone-markers`,
  `csv-export`, plus the ported themes and Sticky Notes.
- **Coverage.** Branch coverage (what the badge shows) must not drop. The
  host modules are small and pure, so this should be straightforward.

## 9. Phases

Each phase is merged on its own and leaves the tests green.

| Phase                                        | Size | Delivers                                                                                                                                                                                                                                                                                                         | Done when                                                                           |
| -------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **0. Spikes**                                | S    | The three checks in §10, each as a throwaway prototype                                                                                                                                                                                                                                                           | Findings written up here; go/no-go per approach                                     |
| **1. Secure runtime**                        | L    | Package loader (file and folder), worker host and runtime, protocol and validation, permissions and consent dialog, registries with owners, failure containment (timeouts, heartbeat, breaker, safe mode), plugin manager statuses, v1 shim, themes and CSV ported. **Plugins no longer run in the app window.** | The security hole is closed; hostile fixtures pass; existing plugin tests rewritten |
| **2. UI kit and project access**             | M    | `SchemaForm`, commands (palette, keys, navbar, sidebar, context menus), plugin settings tab, storage, project data slot, edit operations with undo, app events                                                                                                                                                   | A command-only example plugin works                                                 |
| **3. Field**                                 | L    | Overlay layers, tracks, handles; field views, `turtle-plugin://`, view client, `FieldStage`; Sticky Notes port; `field-3d` example                                                                                                                                                                               | 3D view follows playback; Sticky Notes works for the first time                     |
| **4. Sequence**                              | L    | Plugin action types end to end (rows, timing tiers, markers, code), missing-plugin handling; `markerTypeRegistry` and plugin marker types; `intake-action` and `zone-markers` examples                                                                                                                           | Custom action inserts, times, exports; projects open without the plugin             |
| **5. Simulation, other projects, exporters** | M    | Simulators, ghost robots, deviation stats, `PoseSource`; `files.pickProjects` and `projects.analyze`; exporter options and multi-file output; `robot-sim`, `multi-path`, `csv-export` v2 examples; importers (optional)                                                                                          | Ghost robot from a simulator plays alongside; two autos shown together              |
| **6. Docs and developer experience**         | S–M  | Authoring guide, plugin template, generated `turtle.d.ts`, hot reload, What's New entry, CHANGELOG, README section                                                                                                                                                                                               | A new plugin can be written from the guide alone                                    |

Phase 1 comes first because it closes the current security hole. It is worth
shipping even if later phases slip.

## 10. Risks and spikes

| Risk                                                                                                                | Spike or mitigation                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Custom-scheme iframes may not get their own process in Electron 39, so a hung view could freeze the UI              | **Spike:** load a view with a busy loop and check the frame's `osProcessId` and that the UI stays responsive. Fallback: host views in a `WebContentsView`, which always runs in its own process. |
| Module scripts and WebGL in an opaque-origin iframe                                                                 | **Spike:** a three.js scene served from `turtle-plugin://` with CORS headers.                                                                                                                    |
| The CSP on the worker bootstrap must apply in dev, `vite preview` and the packaged app                              | **Spike:** check `fetch`, `import()` and `importScripts` are blocked in all three; deleting the globals is the second layer.                                                                     |
| Async timing callbacks leave the timeline briefly stale                                                             | Declarative timing covers most actions; stale-while-revalidate for the rest.                                                                                                                     |
| Per-frame messages cost too much                                                                                    | Tracks and robot-space primitives avoid per-frame messages; views get one small frame message per animation frame, measured in the spike.                                                        |
| 224 hardcoded kind checks                                                                                           | Fix only the code paths plugin items flow through. A smoke test loads a project full of plugin items through every main UI path to catch crashes.                                                |
| Third-party v1 plugins that use internals break                                                                     | The shim covers the documented API, plus a migration guide. The number of affected users is unknown.                                                                                             |
| Not plugin-specific: `file:write` accepts any absolute path, so any renderer compromise means arbitrary file writes | Out of scope here, but worth a follow-up to limit writes to project folders and paths the user chose.                                                                                            |

### Spike results (2026-10-15, Electron 39)

All three passed; the throwaway harness is not in the repo.

- **Worker CSP from the response header works.** With
  `default-src 'none'; script-src blob:` on the bootstrap: `fetch` blocked,
  `import()` blocked, `importScripts` of an app script blocked,
  `importScripts(blobURL)` works, no `electronAPI`.
- **Views on `turtle-plugin://` in `<iframe sandbox="allow-scripts">`:** module
  scripts load (with `Access-Control-Allow-Origin: *` and the `corsEnabled`
  scheme privilege), `fetch("./asset")` works, WebGL2 works, origin is
  `null`; reaching the parent document, the app server or storage is blocked.
- **The view runs in its own process** (different `osProcessId`), and a
  3-second busy loop in it left the app's timers running at full rate.
- **esbuild-wasm in Node:** about 115 ms for a first bundle, 27 ms after; it
  doesn't block the event loop; an `onLoad` guard rejects files outside the
  plugin folder.

## 11. Decisions for the owner (answered 2026-10-15)

Summary of the answers below: no v1 compatibility (bundled plugins are
rewritten for v2); plugins are desktop-only forever; plugins may use npm
packages with the user's consent; zod for validation; install from a local
folder or .zip for now. And a constraint on everything: the feature is for
5–10% of users, so it must not measurably cost the other 90–95% anything:
no plugin code loads unless a plugin is on, no new UI appears unless a plugin
adds some, and core code stays as simple as it was.

1. **v1 compatibility.** Recommended: a clean break, with a shim for the
   documented calls. The alternative is an "unsandboxed trusted plugin" mode
   that keeps the old behaviour behind a warning, which means two code paths
   and the security hole kept on purpose. ANSWER: No. Disable v1 compatibility and update pre-packaged files for the new version.
2. **Web build.** Recommended: plugins stay desktop-only, as today, and the
   protocol is built so the web build can follow (views through `srcdoc` and
   blob URLs). The alternative is to support the web build in this effort. ANSWER: We will never, and never want to, support web plugins. This feature is never going to be added and should be apart of the plan.
3. **3D example dependency.** Recommended: add `three` as a devDependency used
   only to build the `field-3d` example into `plugins/`, which matches how
   real plugin authors will work. Alternatives: a dependency-free CSS-3D demo,
   or a test fixture only. ANSWER: This seems like an inadequate answer. I'd like users to be able to add features like this even if it means users must consent to potentially dangerous packages. that's the users choice.
4. **Validation library.** Either `zod` (well known, readable, battle-tested,
   about 50 KB) or a small validator of our own of about 150 lines with no
   dependency. Recommended: zod, for readability. ANSWER: Sure, zod works.
5. **Installing plugins.** Recommended: the local folder plus an "Install from
   folder or .zip" button in the plugin manager, with no remote catalogue. ANSWER: Sure for now, in the future I'll likely create a public repo that facilitates plugins if it really blows up. For now local only is great though.

   NOTE: This feature is expected to only be used by a very small subset of our users. 5-10%. Please ensure that a feature for the 5% does not measurable decrease the quality for the developers or users for the other 95%.
