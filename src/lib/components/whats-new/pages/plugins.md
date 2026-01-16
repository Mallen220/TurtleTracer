# Plugins

Pedro Pathing Visualizer supports a powerful plugin system that allows you to extend its functionality. You can add custom code exporters, UI themes, and even new interface elements using simple JavaScript files.

## How to Add Plugins

1.  Open **Settings** (click the gear icon).
2.  Scroll down to the **Plugins** section.
3.  Click the **Open Plugins Folder** button. This opens the directory on your computer where plugins are stored.
4.  Drop your plugin file (`.js`) into this folder.
5.  Return to the visualizer settings and click **Reload**.
6.  Your plugin should appear in the list. Make sure the checkbox is checked to enable it.

## designing Plugins

Plugins are standard JavaScript files that run within the application. The visualizer provides a global `pedro` object that serves as your API to interact with the system.

### Basic Structure

Create a `.js` file (e.g., `my-plugin.js`) with the following structure:

```javascript
// Register a custom exporter
pedro.registerExporter("My Custom Format", (data) => {
  return "Path length: " + data.lines.length;
});

// Register a custom theme
pedro.registerTheme("Midnight Blue", `
  :root {
    --bg-color: #0f172a;
    --text-color: #f8fafc;
  }
`);
```

### The `pedro` API

The `pedro` object provides several methods and properties to interact with the visualizer:

#### Core Methods

*   **`registerExporter(name, handler)`**: Adds a new option to the Export menu.
    *   `name`: Display name for the exporter.
    *   `handler`: Function receiving project `data` and returning a string.
*   **`registerTheme(name, css)`**: Adds a new theme to the Settings > Interface menu.
    *   `name`: Display name for the theme.
    *   `css`: CSS string defining the theme variables.
*   **`getData()`**: Returns the current project state (read-only).
    *   Returns: `{ startPoint, lines, shapes, sequence }`

#### Advanced Features

For more complex plugins, you can access internal registries and stores:

*   **`pedro.registries`**:
    *   `components`: Register custom Svelte components.
    *   `tabs`: Add new tabs to the side control panel.
    *   `navbarActions`: Add buttons to the top navigation bar.
    *   `hooks`: Listen for events like `onSave`, `onLoad`, etc.

*   **`pedro.stores`**:
    *   `project`: Access reactive stores for path data (`startPointStore`, `linesStore`, etc.).
    *   `app`: Access application-level state.
    *   `get`: The Svelte `get` function to read current store values.

### Example: Adding a Button

Here is a simple example that adds a button to the top navigation bar:

```javascript
pedro.registries.navbarActions.register({
  id: "hello-world-btn",
  icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`,
  title: "Say Hello",
  onClick: () => {
    alert("Hello from Pedro Pathing Plugin!");
  }
});
```
