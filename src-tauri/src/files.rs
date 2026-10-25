// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! File operations for the page. Paths the page sends are checked with
//! `validate_arbitrary_path` first, as the Electron handlers did.
use std::time::UNIX_EPOCH;

use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{Runtime, WebviewWindow};

use crate::dialogs::{self, Filter};
use crate::git::git_statuses;
use crate::java_follow::{is_code_file_path, JavaFollow};
use crate::paths::{self, display, is_project_file_path, validate_arbitrary_path};

type Result<T> = std::result::Result<T, String>;

fn io_err(action: &str) -> impl Fn(std::io::Error) -> String + '_ {
    move |e| {
        eprintln!("Error {action}: {e}");
        e.to_string()
    }
}

/// Milliseconds since 1970, which the page turns back into a Date.
pub fn mtime_ms(meta: &std::fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

#[tauri::command]
pub async fn file_copy(src_path: String, dest_path: String) -> Result<bool> {
    let src = validate_arbitrary_path(&src_path)?;
    let dest = validate_arbitrary_path(&dest_path)?;
    tokio::fs::copy(src, dest)
        .await
        .map_err(io_err("copying file"))?;
    Ok(true)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Renamed {
    success: bool,
    new_path: String,
}

#[tauri::command]
pub async fn file_rename(old_path: String, new_path: String) -> Result<Renamed> {
    let old = validate_arbitrary_path(&old_path)?;
    let new = validate_arbitrary_path(&new_path)?;
    if tokio::fs::try_exists(&new).await.unwrap_or(false) {
        let name = new.file_name().map(|n| n.to_string_lossy().into_owned());
        return Err(format!(
            "File \"{}\" already exists",
            name.unwrap_or_default()
        ));
    }
    tokio::fs::rename(&old, &new)
        .await
        .map_err(io_err("renaming file"))?;
    Ok(Renamed {
        success: true,
        new_path: display(&new),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    name: String,
    path: String,
    size: u64,
    modified: f64,
    git_status: String,
    is_directory: bool,
}

#[tauri::command]
pub async fn file_list(
    directory: Option<String>,
    follow: tauri::State<'_, JavaFollow>,
) -> Result<Vec<FileInfo>> {
    let Some(directory) = directory.filter(|d| !d.trim().is_empty()) else {
        return Ok(vec![]);
    };
    let dir = match validate_arbitrary_path(&directory) {
        Ok(dir) => dir,
        Err(e) => {
            eprintln!("file_list called with invalid directory: {e}");
            return Ok(vec![]);
        }
    };
    let mut entries = match tokio::fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!(
                "Directory not accessible in file_list: {}: {e}",
                display(&dir)
            );
            return Ok(vec![]);
        }
    };
    let statuses = git_statuses(&dir).await;
    let mut files = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        let path = dir.join(&name);
        // fs.stat follows symlinks; a broken one is left out.
        let Ok(meta) = tokio::fs::metadata(&path).await else {
            continue;
        };
        let is_directory = meta.is_dir();
        if !is_directory && !is_project_file_path(&name) && !is_code_file_path(&name) {
            continue;
        }
        // The page may follow a code file it was shown here.
        follow.offer(&path);
        let real = tokio::fs::canonicalize(&path)
            .await
            .unwrap_or_else(|_| path.clone());
        files.push(FileInfo {
            name,
            path: display(&path),
            size: if is_directory { 0 } else { meta.len() },
            modified: mtime_ms(&meta),
            git_status: statuses
                .get(&real)
                .cloned()
                .unwrap_or_else(|| "clean".into()),
            is_directory,
        });
    }
    Ok(files)
}

#[tauri::command]
pub async fn file_read(file_path: String) -> Result<String> {
    let path = validate_arbitrary_path(&file_path)?;
    let bytes = tokio::fs::read(path)
        .await
        .map_err(io_err("reading file"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub async fn file_write(file_path: String, content: String) -> Result<bool> {
    let path = validate_arbitrary_path(&file_path)?;
    tokio::fs::write(path, content)
        .await
        .map_err(io_err("writing file"))?;
    Ok(true)
}

/// The parts of Electron's save dialog options the page uses.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveDialogOptions {
    title: Option<String>,
    default_path: Option<String>,
    #[serde(default)]
    filters: Vec<Filter>,
}

#[tauri::command]
pub async fn file_show_save_dialog<R: Runtime>(
    window: WebviewWindow<R>,
    options: Option<SaveDialogOptions>,
) -> Result<Option<String>> {
    let options = options.unwrap_or_default();
    Ok(dialogs::save(
        &window,
        options.title,
        options.default_path,
        options.filters,
    )
    .await)
}

#[tauri::command]
pub async fn file_write_base64(file_path: String, base64_content: String) -> Result<bool> {
    let path = validate_arbitrary_path(&file_path)?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_content.trim())
        .map_err(|e| e.to_string())?;
    tokio::fs::write(path, bytes)
        .await
        .map_err(io_err("writing base64 file"))?;
    Ok(true)
}

#[tauri::command]
pub async fn export_pp<R: Runtime>(
    window: WebviewWindow<R>,
    content: String,
    default_name: Option<String>,
) -> Result<Option<String>> {
    let name = default_name.unwrap_or_else(|| "trajectory.pp".into());
    let name = if name.ends_with(".pp") {
        name
    } else {
        format!("{name}.pp")
    };
    let chosen = dialogs::save(
        &window,
        Some("Export .pp File (Legacy)".into()),
        Some(name),
        vec![Filter::new("Turtle Tracer Path", &["pp"])],
    )
    .await;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = validate_arbitrary_path(&chosen)?;
    tokio::fs::write(path, content)
        .await
        .map_err(io_err("exporting legacy .pp file"))?;
    Ok(Some(chosen))
}

#[tauri::command]
pub async fn file_delete(file_path: String) -> Result<bool> {
    let path = validate_arbitrary_path(&file_path)?;
    let meta = tokio::fs::metadata(&path)
        .await
        .map_err(io_err("deleting file"))?;
    if meta.is_dir() {
        tokio::fs::remove_dir_all(&path).await
    } else {
        tokio::fs::remove_file(&path).await
    }
    .map_err(io_err("deleting file"))?;
    Ok(true)
}

#[tauri::command]
pub async fn file_exists(file_path: String) -> bool {
    match validate_arbitrary_path(&file_path) {
        Ok(path) => tokio::fs::try_exists(path).await.unwrap_or(false),
        Err(_) => false,
    }
}

#[tauri::command]
pub fn file_resolve_path(base: Option<String>, relative: Option<String>) -> Option<String> {
    match (base.filter(|b| !b.is_empty()), relative) {
        (Some(base), Some(relative)) if !relative.is_empty() => {
            Some(paths::resolve_from(&base, &relative))
        }
        (_, relative) => relative,
    }
}

#[tauri::command]
pub fn file_make_relative_path(base: Option<String>, target: Option<String>) -> Option<String> {
    match (base.filter(|b| !b.is_empty()), target) {
        (Some(base), Some(target)) if !target.is_empty() => {
            Some(paths::relative_from(&base, &target))
        }
        (_, target) => target,
    }
}

/// The native "Open" dialog for a project file.
#[tauri::command]
pub async fn file_choose_project<R: Runtime>(window: WebviewWindow<R>) -> Option<String> {
    dialogs::pick_file(
        &window,
        "Open",
        vec![Filter::new("Turtle Tracer Project", &["turt", "pp"])],
    )
    .await
}
