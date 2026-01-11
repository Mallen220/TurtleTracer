# File Management

The visualizer uses a local file system to store projects as `.pp` files, giving you full control over your data.

## File Browser

The file manager appears in the sidebar when you click **Files** in the top-left corner.

### Toolbar Controls

*   **Search**: Filter files by name.
*   **Sort**: Toggle between **Name** and **Date** sorting.
*   **View**: Switch between **List** (details) and **Grid** (visual previews) modes.
*   **Import**: Load an external `.pp` file into the current directory.
*   **New File**: Create a blank project.
*   **Refresh**: Reload the file list.
*   **Change Directory**: Open a system dialog to select a new working folder.

### Navigation

The breadcrumb bar below the toolbar shows your current directory.

*   **Edit Path**: Click the path text to manually type a new directory location.
*   **Home Directory**: You can use `~` as a shortcut for your home folder.

## File Operations

Right-click a file (or click the **⋮** menu in Grid view) to access actions:

*   **Open**: Load the project. Double-clicking also works.
*   **Save Current to File**: Overwrite this file with your currently active project.
*   **Rename**: Change the file name.
*   **Delete**: Permanently remove the file.
*   **Duplicate**: Create a copy of the project.

### Advanced Tools

*   **Mirror Copy**: Creates a mirrored version of the path (e.g., for the opposite alliance).
*   **Reverse Copy**: Creates a version with the path reversed.

## Saving & Exporting

*   **Save Project**: Press `Ctrl+S` (or `Cmd+S`) to save changes to the current file.
*   **Export**: To generate Java code or .PP, use the **Export** button in the main navbar. See [Exporting Code] for details.
