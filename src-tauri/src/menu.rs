// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! The application menu. Most items send a `menu-action` to the focused
//! window. Reload, close-window and devtools have no keyboard shortcuts, so
//! they can't be hit by accident while editing.
use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::app::{focused_or_last, open_in_browser, open_window};

/// Menu ids that are passed to the page as they are.
const PAGE_ACTIONS: [&str; 13] = [
    "new-path",
    "open-file",
    "save-project",
    "save-as",
    "export-java",
    "export-points",
    "export-sequential",
    "export-pp",
    "export-gif",
    "undo",
    "redo",
    "open-settings",
    "open-shortcuts",
];

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<tauri::menu::MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, label);
    if let Some(accelerator) = accelerator {
        builder = builder.accelerator(accelerator);
    }
    builder.build(app)
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let is_mac = cfg!(target_os = "macos");
    let mut menu = MenuBuilder::new(app);

    if is_mac {
        let about = AboutMetadata {
            name: Some("Turtle Tracer".into()),
            version: Some(app.package_info().version.to_string()),
            ..Default::default()
        };
        let app_menu = SubmenuBuilder::new(app, "Turtle Tracer")
            .item(&PredefinedMenuItem::about(app, None, Some(about))?)
            .separator()
            .item(&PredefinedMenuItem::services(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&item(
                app,
                "quit",
                "Quit Turtle Tracer",
                Some("CmdOrCtrl+Q"),
            )?)
            .build()?;
        menu = menu.item(&app_menu);
    }

    let export = SubmenuBuilder::new(app, "Export")
        .item(&item(app, "export-java", "Export as Java Code...", None)?)
        .item(&item(
            app,
            "export-points",
            "Export as Points Array...",
            None,
        )?)
        .item(&item(
            app,
            "export-sequential",
            "Export as Sequential Command...",
            None,
        )?)
        .item(&item(app, "export-pp", "Export as .turt File...", None)?)
        .separator()
        .item(&item(app, "export-gif", "Export GIF...", None)?)
        .build()?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&item(app, "new-path", "New Path", Some("CmdOrCtrl+N"))?)
        .item(&item(
            app,
            "new-window",
            "New Window",
            Some("CmdOrCtrl+Shift+N"),
        )?)
        .item(&item(app, "open-file", "Open...", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item(app, "save-project", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item(
            app,
            "save-as",
            "Save As...",
            Some("CmdOrCtrl+Shift+S"),
        )?)
        .separator()
        .item(&export)
        .separator()
        .item(&if is_mac {
            item(app, "close-window", "Close Window", None)?
        } else {
            item(app, "quit", "Quit", None)?
        })
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&item(app, "undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", "Redo", Some("CmdOrCtrl+Y"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let fullscreen = if is_mac { "Ctrl+Cmd+F" } else { "F11" };
    let view = SubmenuBuilder::new(app, "View")
        .item(&item(app, "toggle-devtools", "Toggle DevTools", None)?)
        .separator()
        .item(&item(
            app,
            "reset-zoom",
            "Actual Size",
            Some("CmdOrCtrl+0"),
        )?)
        .separator()
        .item(&item(
            app,
            "toggle-fullscreen",
            "Toggle Full Screen",
            Some(fullscreen),
        )?)
        .separator()
        .item(&item(
            app,
            "open-settings",
            "Settings",
            Some("CmdOrCtrl+,"),
        )?)
        .build()?;

    let mut window = SubmenuBuilder::new(app, "Window")
        .item(&item(app, "minimize", "Minimize", Some("CmdOrCtrl+M"))?)
        .item(&item(
            app,
            "zoom",
            if is_mac { "Zoom" } else { "Maximize" },
            None,
        )?);
    if !is_mac {
        window = window.item(&item(app, "close-window", "Close", None)?);
    }
    let window = window.build()?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&item(
            app,
            "open-shortcuts",
            "Keyboard Shortcuts",
            Some("CmdOrCtrl+/"),
        )?)
        .separator()
        .item(&item(app, "github", "See Project on GitHub", None)?)
        .build()?;

    let menu = menu.items(&[&file, &edit, &view, &window, &help]).build()?;

    #[cfg(target_os = "macos")]
    {
        window.set_as_windows_menu_for_nsapp()?;
        help.set_as_help_menu_for_nsapp()?;
    }
    Ok(menu)
}

/// Closes every window, each asking first about unsaved changes, the way
/// quitting the Electron app did.
fn quit<R: Runtime>(app: &AppHandle<R>) {
    for window in app.webview_windows().into_values() {
        let _ = window.close();
    }
}

pub fn handle<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    let window = focused_or_last(app)
        .filter(|w| w.is_focused().unwrap_or(false) || app.webview_windows().len() == 1);
    match id {
        "new-window" => open_window(app),
        "quit" => quit(app),
        "github" => open_in_browser(app, "https://github.com/Mallen220/TurtleTracer"),
        _ => {
            let Some(window) = window else {
                return;
            };
            match id {
                "close-window" => {
                    let _ = window.close();
                }
                "toggle-devtools" => {
                    if window.is_devtools_open() {
                        window.close_devtools();
                    } else {
                        window.open_devtools();
                    }
                }
                "reset-zoom" => {
                    let _ = window.set_zoom(1.0);
                }
                "toggle-fullscreen" => {
                    let full = window.is_fullscreen().unwrap_or(false);
                    let _ = window.set_fullscreen(!full);
                }
                "minimize" => {
                    let _ = window.minimize();
                }
                "zoom" => {
                    if window.is_maximized().unwrap_or(false) {
                        let _ = window.unmaximize();
                    } else {
                        let _ = window.maximize();
                    }
                }
                action if PAGE_ACTIONS.contains(&action) => {
                    let _ = window.emit_to(window.label(), "menu-action", action);
                }
                _ => {}
            }
        }
    }
}
