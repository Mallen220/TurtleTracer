// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Native open and save dialogs, attached to the window that asked.
use std::path::Path;

use serde::Deserialize;
use tauri::{Runtime, WebviewWindow};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};
use tokio::sync::oneshot;

#[derive(Deserialize)]
pub struct Filter {
    name: String,
    extensions: Vec<String>,
}

impl Filter {
    pub fn new(name: &str, extensions: &[&str]) -> Self {
        Self {
            name: name.into(),
            extensions: extensions.iter().map(|e| e.to_string()).collect(),
        }
    }
}

fn builder<R: Runtime>(
    window: &WebviewWindow<R>,
    title: Option<String>,
    filters: Vec<Filter>,
) -> FileDialogBuilder<R> {
    let mut dialog = window.dialog().file().set_parent(window);
    if let Some(title) = title {
        dialog = dialog.set_title(title);
    }
    for filter in filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        dialog = dialog.add_filter(filter.name, &extensions);
    }
    dialog
}

fn to_string(path: Option<FilePath>) -> Option<String> {
    path.and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().into_owned())
}

/// A save dialog. `default_path` is a file name or a full path, as in Electron.
pub async fn save<R: Runtime>(
    window: &WebviewWindow<R>,
    title: Option<String>,
    default_path: Option<String>,
    filters: Vec<Filter>,
) -> Option<String> {
    let mut dialog = builder(window, title, filters);
    if let Some(default_path) = default_path.filter(|p| !p.is_empty()) {
        let path = Path::new(&default_path);
        if let Some(dir) = path.parent().filter(|d| !d.as_os_str().is_empty()) {
            dialog = dialog.set_directory(dir);
        }
        if let Some(name) = path.file_name() {
            dialog = dialog.set_file_name(name.to_string_lossy());
        }
    }
    let (tx, rx) = oneshot::channel();
    dialog.save_file(move |p| {
        let _ = tx.send(p);
    });
    to_string(rx.await.ok().flatten())
}

pub async fn pick_file<R: Runtime>(
    window: &WebviewWindow<R>,
    title: &str,
    filters: Vec<Filter>,
) -> Option<String> {
    let (tx, rx) = oneshot::channel();
    builder(window, Some(title.into()), filters).pick_file(move |p| {
        let _ = tx.send(p);
    });
    to_string(rx.await.ok().flatten())
}

pub async fn pick_folder<R: Runtime>(window: &WebviewWindow<R>, title: &str) -> Option<String> {
    let (tx, rx) = oneshot::channel();
    builder(window, Some(title.into()), vec![]).pick_folder(move |p| {
        let _ = tx.send(p);
    });
    to_string(rx.await.ok().flatten())
}
