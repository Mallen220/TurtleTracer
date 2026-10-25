// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Windows, files opened from the OS, closing with unsaved changes, and the
//! small app facts the page asks for.
use std::collections::HashSet;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use tauri::webview::NewWindowResponse;
use tauri::{
    AppHandle, Emitter, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

use crate::java_follow::JavaFollow;
use crate::paths::{data_dir, display};

#[derive(Default)]
pub struct AppState {
    /// A file the OS asked us to open before a window was ready for it.
    pending_file: Mutex<Option<String>>,
    /// Windows whose page has started and handles close requests.
    ready: Mutex<HashSet<String>>,
    /// Windows the page said may close (after asking about unsaved changes).
    close_approved: Mutex<HashSet<String>>,
    next_window: AtomicUsize,
    /// `--smoke-test`: quit as soon as the first page has started.
    pub smoke_test: bool,
}

impl AppState {
    pub fn new(smoke_test: bool, launch_file: Option<String>) -> Self {
        Self {
            smoke_test,
            pending_file: Mutex::new(launch_file),
            ..Default::default()
        }
    }
}

pub fn is_web_url(url: &str) -> bool {
    Url::parse(url).is_ok_and(|u| u.scheme() == "http" || u.scheme() == "https")
}

/// Whether a navigation stays inside the app's own pages.
fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    match url.scheme() {
        "tauri" | "about" | "blob" | "data" => true,
        "http" | "https" => {
            url.host_str() == Some("tauri.localhost")
                || dev_url.is_some_and(|dev| dev.origin() == url.origin())
        }
        _ => false,
    }
}

/// Opens a link in the user's browser. A failure is logged, not thrown.
pub fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &str) {
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        eprintln!("Failed to open link: {url}: {e}");
    }
}

/// Opens a new app window. Each page only ever shows the app itself: links
/// anywhere else open in the user's browser.
pub fn create_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
    let state = app.state::<AppState>();
    let n = state.next_window.fetch_add(1, Ordering::Relaxed);
    let label = format!("main-{n}");
    let dev_url = app.config().build.dev_url.clone();

    let nav_app = app.clone();
    let new_window_app = app.clone();
    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Turtle Tracer")
        .inner_size(1360.0, 800.0)
        .on_navigation(move |url| {
            if is_app_url(url, dev_url.as_ref()) {
                return true;
            }
            if is_web_url(url.as_str()) {
                open_in_browser(&nav_app, url.as_str());
            }
            false
        })
        .on_new_window(move |url, _features| {
            if is_web_url(url.as_str()) {
                open_in_browser(&new_window_app, url.as_str());
            }
            NewWindowResponse::Deny
        });

    // Windows' webview can't do HTML drag and drop (used to reorder paths
    // and more) while it handles file drops itself, so files dropped there
    // are read by the page instead.
    #[cfg(windows)]
    {
        builder = builder.disable_drag_drop_handler();
        if let Some(dir) = crate::store::local_state_dir() {
            builder = builder.data_directory(dir.join("turtle-tracer").join("WebView2"));
        }
    }

    let window = builder.build()?;
    let events_window = window.clone();
    window.on_window_event(move |event| {
        let app = events_window.app_handle();
        let state = app.state::<AppState>();
        let label = events_window.label().to_string();
        match event {
            WindowEvent::CloseRequested { api, .. } => {
                // A page that never started can't answer, so it just closes.
                let ready = state.ready.lock().unwrap().contains(&label);
                let approved = state.close_approved.lock().unwrap().contains(&label);
                if ready && !approved {
                    api.prevent_close();
                    let _ = events_window.emit_to(&label, "app-close-requested", ());
                }
            }
            WindowEvent::Destroyed => {
                state.ready.lock().unwrap().remove(&label);
                state.close_approved.lock().unwrap().remove(&label);
                app.state::<JavaFollow>().stop(&label);
            }
            _ => {}
        }
    });
    Ok(window)
}

/// Opens a window from code that can't wait for it; a failure is logged.
pub fn open_window<R: Runtime>(app: &AppHandle<R>) {
    if let Err(e) = create_window(app) {
        eprintln!("Failed to create window: {e}");
    }
}

/// The focused window, or the newest one.
pub fn focused_or_last<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    let windows = app.webview_windows();
    if let Some(w) = windows.values().find(|w| w.is_focused().unwrap_or(false)) {
        return Some(w.clone());
    }
    windows.into_values().max_by_key(|w| {
        w.label()
            .trim_start_matches("main-")
            .parse::<usize>()
            .unwrap_or(0)
    })
}

pub fn focus<R: Runtime>(window: &WebviewWindow<R>) {
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.set_focus();
}

/// Opens a project file the OS handed us, in a window that is ready for it.
pub fn handle_opened_file<R: Runtime>(app: &AppHandle<R>, file_path: String) {
    let state = app.state::<AppState>();
    let ready = state.ready.lock().unwrap().clone();
    let window = focused_or_last(app).filter(|w| ready.contains(w.label()));
    match window {
        Some(window) => {
            let _ = window.emit_to(window.label(), "open-file-path", &file_path);
            focus(&window);
        }
        None => *state.pending_file.lock().unwrap() = Some(file_path),
    }
}

#[tauri::command]
pub fn renderer_ready<R: Runtime>(
    app: AppHandle<R>,
    window: WebviewWindow<R>,
    state: tauri::State<'_, AppState>,
) -> bool {
    state
        .ready
        .lock()
        .unwrap()
        .insert(window.label().to_string());
    if let Some(file_path) = state.pending_file.lock().unwrap().take() {
        let _ = window.emit_to(window.label(), "open-file-path", file_path);
    }
    if state.smoke_test {
        println!("Smoke test: the page started.");
        app.exit(0);
    }
    #[cfg(debug_assertions)]
    crate::probe::run_once(&window);
    true
}

#[tauri::command]
pub fn app_close_approved<R: Runtime>(window: WebviewWindow<R>, state: tauri::State<'_, AppState>) {
    state
        .close_approved
        .lock()
        .unwrap()
        .insert(window.label().to_string());
    let _ = window.close();
}

#[tauri::command]
pub fn app_open_external<R: Runtime>(app: AppHandle<R>, url: String) -> bool {
    if !is_web_url(&url) {
        eprintln!("Blocked attempt to open external url with unsupported protocol: {url}");
        return false;
    }
    match app.opener().open_url(&url, None::<&str>) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("Failed to open external url: {url}: {e}");
            false
        }
    }
}

#[tauri::command]
pub fn app_get_app_data_path() -> String {
    display(&data_dir())
}

#[tauri::command]
pub fn app_get_version<R: Runtime>(app: AppHandle<R>) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn app_is_windows_store() -> bool {
    crate::store::is_windows_store()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_apps_own_pages_load_in_the_window() {
        let dev = Url::parse("http://localhost:5173/").unwrap();
        let ok = |s: &str| is_app_url(&Url::parse(s).unwrap(), Some(&dev));
        assert!(ok("tauri://localhost/index.html"));
        assert!(ok("http://tauri.localhost/"));
        assert!(ok("http://localhost:5173/src/main.ts"));
        assert!(ok("about:blank"));
        assert!(!ok("http://localhost:5174/"));
        assert!(!ok("https://github.com/Mallen220/TurtleTracer"));
        assert!(!ok("file:///etc/passwd"));
        assert!(!is_app_url(
            &Url::parse("http://localhost:5173/").unwrap(),
            None
        ));
        assert!(is_web_url("https://x.y") && !is_web_url("javascript:alert(1)"));
    }
}
