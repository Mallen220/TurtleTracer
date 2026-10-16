# Writing Turtle Tracer plugins

Plugins add to Turtle Tracer: new kinds of step, new event markers, exporters,
drawings on the field, other views of the field (a 3D one, say), robot
simulators, commands, buttons and settings. They work in the desktop app.

Every plugin runs in a sandbox. Its code can read the open project and use
the `turtle` API, but it can't reach your files, the internet or the rest of
the app. Anything more (changing the project, opening files) needs a
permission the user agrees to. If a plugin crashes, hangs or misbehaves,
Turtle Tracer stops it and carries on.

The plugins that come with the app are good examples: they're in your
plugins folder (Plugin Manager → Open Folder), and in `plugins/` in the
source.

## A first plugin

A plugin is a folder in the plugins folder, named after the plugin's id,
with a `plugin.json`:

```
plugins/
  turtle.d.ts            ← types for your editor (kept up to date by the app)
  hello/
    plugin.json
    main.ts
```

```json
{
  "id": "hello",
  "name": "Hello",
  "version": "1.0.0",
  "apiVersion": 2,
  "description": "Says hello.",
  "main": "main.ts"
}
```

```ts
/// <reference path="../turtle.d.ts" />

turtle.commands.register({
  id: "hello",
  label: "Say hello",
  run() {
    const { paths } = turtle.project.get();
    turtle.ui.toast(`This project has ${paths.length} paths.`);
  },
});
```

Open the Plugin Manager, press Refresh, and turn Hello on. "Say hello" is
now in the command palette (Ctrl/Cmd+P). After editing a plugin's files,
press its Restart button.

`main` can be TypeScript or JavaScript. Turtle Tracer bundles it for you, so
you can split your code across files and `import` npm packages (see
[Packages](#npm-packages)) without a build step.

## plugin.json

| Field                                      |                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `id`                                       | Lower-case letters, digits and dashes. Must match the folder name.                                          |
| `name`, `version`, `description`, `author` | Shown in the Plugin Manager. `version` is like `1.0.0`.                                                     |
| `apiVersion`                               | `2`.                                                                                                        |
| `main`                                     | The plugin's script (optional: a theme-only plugin needs none).                                             |
| `views`                                    | Pages shown in the app; see [Views](#views).                                                                |
| `themes`                                   | `[{ "name": "My Theme", "css": "theme.css" }]`; picked under Settings → Interface → Theme.                  |
| `settings`                                 | Form fields for the plugin's settings, shown in the Plugin Manager; read them with `turtle.settings.get()`. |
| `permissions`                              | `"project.write"` and/or `"files.pick"`; see [Permissions](#permissions).                                   |
| `dependencies`                             | npm packages, e.g. `{ "three": "0.170.0" }`; see [Packages](#npm-packages).                                 |

## Coordinates and units

Everything is in field inches, with headings in degrees counter-clockwise
from +x (Pedro's convention) and times in seconds. The user may work in
centimetres; forms convert for you (see `unit` on number fields).

## What a plugin can do

All of it is on the global `turtle`; `turtle.d.ts` documents every call.

### Read the project

```ts
const project = turtle.project.get(); // paths, steps, shapes, robot, field
const plan = await turtle.project.plan(); // poses every 20 ms, when each step happens
turtle.events.on("projectChanged", (project) => {
  /* ... */
});
```

`project.get()` is cheap: Turtle Tracer keeps a copy up to date in the
background. `plan()` is the routine timed the way Turtle Tracer times it, so
you never need to re-implement Pedro's timing.

Other events: `projectLoaded`, `projectSaved`, `settingsChanged`,
`selectionChanged` and `playback` (the playhead, up to 30 times a second).

### Save data in the project

```ts
await turtle.project.setData({ notes: ["Park here"] });
turtle.project.get().data; // { notes: ["Park here"] }
```

Each plugin has its own slot in the project file.

### Change the project

```ts
await turtle.project.edit("Spread waypoints", [
  { op: "movePoint", pathId, point: "end", x: 48, y: 30 },
  { op: "insertStep", index: 2, step: { kind: "plugin", type: "intake" } },
]);
```

All the operations are applied together as one step the user can undo. A
plugin can always add and change its own steps; anything else needs the
`project.write` permission. The operations are listed under `EditOp` in
`turtle.d.ts`.

### Commands, buttons and menus

```ts
turtle.commands.register({
  id: "add-note",
  label: "Add sticky note",
  run: ({ at }) => addNote(at),
});
turtle.ui.addNavbarButton({ command: "add-note", icon: "<svg>…</svg>" });
turtle.ui.addContextMenuItem({
  command: "add-note",
  label: "Add sticky note here",
});
```

Commands appear in the command palette. A context menu item is on the
field's right-click menu, and `run` gets the point that was clicked.

### Dialogs and toasts

```ts
turtle.ui.toast("Saved", "success");
const ok = await turtle.ui.confirm({ title: "Delete?", message: "Really?" });
const name = await turtle.ui.prompt({ title: "Name" });
const values = await turtle.ui.form({
  title: "Intake",
  fields: [
    {
      key: "seconds",
      type: "number",
      unit: "time",
      label: "Run for",
      default: 0.8,
    },
    { key: "reverse", type: "toggle", label: "Backwards" },
  ],
});
```

Forms are data, drawn by Turtle Tracer with its own inputs, so they match
the app and its themes. Field types: `number` (with `unit`: `distance`,
`angle`, `time`, `speed`), `text` (optionally `multiline`), `toggle`,
`select` and `color`. The same fields describe settings, steps and markers.

### Draw on the field

```ts
const layer = turtle.field.addLayer({
  draw: () => [
    {
      type: "rect",
      x: 72,
      y: 72,
      width: 24,
      height: 12,
      fill: "#fde68a",
      id: "zone",
    },
    { type: "text", x: 72, y: 72, text: "Zone" },
    { type: "circle", x: 9, y: 0, radius: 2, space: "robot", fill: "#22c55e" },
    { type: "robot", track: "ghost", color: "#64748b" },
  ],
  onClick: (id) => turtle.ui.toast(`Clicked ${id}`),
});
layer.setTrack("ghost", plan.poses);
```

Shapes: `circle`, `rect`, `line` (or a polygon with `closed`), `text`,
`arrow` and `robot`. `draw` runs again when the project changes, or when you
call `layer.redraw()`; with `redrawOn: { playback: true }` it also runs as the
robot moves. Shapes with `space: "robot"` are placed relative to the robot
(x forward, y to its left) and follow it by themselves. A `robot` shape with
a `track` moves along that track during playback, with no work from you.

### New kinds of step

```ts
turtle.actions.register({
  name: "intake",
  label: "Intake",
  color: "#0d9488",
  fields: [
    {
      key: "seconds",
      type: "number",
      unit: "time",
      label: "Run for",
      default: 0.8,
    },
  ],
  timing: { secondsFrom: "seconds" },
  code: {
    sequential: ({ step }) =>
      `new RunIntake(intake).withTimeout(${step.data.seconds * 1000})`,
    java: ({ step, state }) => ({ code: `case ${state}: …`, states: 2 }),
  },
});
```

The step gets an "Add Intake" button, a row in the table and a card in the
Paths tab with its fields. `timing` lets Turtle Tracer time it without asking
you; for a step that moves or turns the robot, give a `time` function that
returns the seconds and, optionally, the poses it drives through. `code`
writes what the exporters put in the generated Java.

Projects keep your steps even on a computer without your plugin: they're
listed as needing it, take no time, and are left out of exported code with a
note.

### New kinds of event marker

```ts
turtle.markers.register({
  name: "before-end",
  label: "Before the end of the path",
  fields: [
    {
      key: "distance",
      type: "number",
      unit: "distance",
      label: "Distance",
      default: 6,
    },
  ],
  resolve: ({ marker, step, plan }) => secondsIntoStep, // or null
});
```

The marker type is offered in the event markers list. `resolve` says when
the marker fires; Turtle Tracer saves that as an ordinary marker position,
so it exports with every exporter, and the robot code (TurtleTracerLib)
reads it, even where the plugin isn't installed.

### Exporters

```ts
turtle.exporters.register({
  name: "csv",
  label: "CSV",
  extension: "csv",
  export: ({ project, plan }) => toCsv(plan),
});
```

The exporter is in the Export menu, and its output can be copied or saved.

### Simulators

```ts
turtle.simulators.register({
  name: "momentum",
  label: "Momentum robot",
  simulate: ({ project, plan }) => ({
    poses: track,
    notes: [{ time: 2.1, text: "Wheel slip" }],
  }),
});
```

A Sim menu appears by the playback controls. The simulation runs again
shortly after every change and shows as a ghost robot, or drives the robot
itself, with how far it strays from the plan.

### Other projects

```ts
const files = await turtle.files.pickProjects({ multiple: true }); // needs "files.pick"
const { plan } = await turtle.projects.analyze(files[0]); // timed by Turtle Tracer
```

### Storage

`turtle.storage.get/set/delete` keep up to 1 MB of data for your plugin on
this computer, outside the project.

## Views

A view is an HTML page from your plugin, shown in a sandboxed frame: as
another way of showing the field (`"slot": "field"`, with a 2D/… switch on the
field), or as a tab in the control panel (`"slot": "panel"`).

```json
"views": { "field3d": { "entry": "view/index.html", "slot": "field", "title": "3D" } }
```

```html
<!doctype html>
<html>
  <head>
    <script type="module" src="./main.ts"></script>
  </head>
  <body></body>
</html>
```

```ts
import { connect } from "turtle:view";

const view = await connect();
draw(view.scene); // project, plan, theme, field image
view.onScene(draw);
view.onFrame(({ pose, time, playing }) => moveRobot(pose));
view.seek(3); // control playback
view.post({ hello: true }); // talk to main.ts (turtle.views.onMessage)
```

Views have a DOM, canvas and WebGL, and load files from the plugin's own
folder (`fetch("./model.glb")` works). Scripts are bundled like `main`.
Inline `<script>`s aren't allowed. See the 3D Field plugin for a full example.

## Permissions

| Permission      | Lets the plugin                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| _(always)_      | Read the open project, add commands, buttons, menus, steps, markers, drawings, views and exporters, save its own data and settings. |
| `project.write` | Change anything in the project, through undoable edits.                                                                             |
| `files.pick`    | Ask the user to choose project files, and read the ones they choose.                                                                |

The user is asked when they turn on a plugin that wants a permission or
packages, and again if a new version asks for more.

## npm packages

List packages in `dependencies`:

```json
"dependencies": { "three": "0.170.0" }
```

When the user turns the plugin on, Turtle Tracer shows them the list and,
once they agree, downloads the packages (and what they need) from the npm
registry, checks each against the registry's integrity hash, and puts them in
the plugin's `node_modules`. No install scripts run. Your code imports them
as usual, and they run in your plugin's sandbox like the rest of it. Pin
exact versions so everyone gets the same code. Packages used by views must
ship ES modules.

You can also ship packages in the plugin folder yourself.

## The sandbox

Each plugin runs in a hidden page on its own origin, in its own process,
with a policy that allows nothing but its own files:

- no network (`fetch` to anywhere but the plugin's folder fails);
- no browser storage (`localStorage`, IndexedDB): use `turtle.storage`;
- no access to the app, other plugins or your files;
- no popups or navigation away from the plugin.

Turtle Tracer checks everything a plugin sends and stops a plugin that:

- throws repeatedly (5 errors in 30 seconds pause it);
- stops answering for 6 seconds;
- sends more than 2,000 messages a second;
- takes longer than its time limit: 15 s for an export, 60 s for a
  simulation, 2 s for a step's timing or a marker.

Some limits on what you send: 5,000 shapes per layer, 200,000 samples per
track, 64 form fields, 1 MB of storage.

Start Turtle Tracer with `--safe-mode` to start it with every plugin off.

## Debugging

- The Plugin Manager shows each plugin's state, why it isn't running, and
  its recent errors.
- A plugin's `console` output shows in its log there too (Show log), along
  with errors from its views. A view whose script doesn't build shows the
  error in its place.
- For anything else, open the developer tools (View › Toggle DevTools);
  each plugin and view is listed in the console's context menu.
- Press Restart after editing a plugin's files.

## Coming from version 1

Version 1 plugins (single `.js`/`.ts` files with `turtle.registerTheme`,
`turtle.stores`, `turtle.registries`…) no longer run, because they ran with
full access to the app. The Plugin Manager lists them as old-format plugins.
To update one:

1. Make a folder with a `plugin.json` and move the script in as `main.ts`.
2. Themes: move the CSS to a file and list it under `themes`.
3. `registerExporter(name, fn)` → `turtle.exporters.register({ name, label, export })`.
4. `registerFeature({ navbar, contextMenu, render })` → commands with
   `addNavbarButton`/`addContextMenuItem`, and `field.addLayer` for drawing.
5. `getData()` → `turtle.project.get()`; `stores`/`registries` → the matching
   `turtle` calls and `project.edit`.
