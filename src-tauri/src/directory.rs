// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! The AutoPaths folder and the directory settings saved with it.
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{Runtime, WebviewWindow};

use crate::dialogs;
use crate::files::mtime_ms;
use crate::paths::{data_dir, display, is_project_file_path, validate_arbitrary_path};

type Result<T> = std::result::Result<T, String>;

fn settings_path() -> std::path::PathBuf {
    data_dir().join("directory-settings.json")
}

fn default_settings() -> Value {
    json!({
        "autoPathsDirectory": "",
        "plugins": {
            "Example-csv-exporter.js": false,
            "Example-pink-theme.js": false,
        },
    })
}

pub async fn load_settings() -> Value {
    match tokio::fs::read_to_string(settings_path()).await {
        Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| default_settings()),
        Err(_) => default_settings(),
    }
}

pub async fn save_settings(settings: &Value) -> bool {
    let text = match serde_json::to_string_pretty(settings) {
        Ok(text) => text,
        Err(e) => {
            eprintln!("Error saving directory settings: {e}");
            return false;
        }
    };
    if let Err(e) = tokio::fs::create_dir_all(data_dir()).await {
        eprintln!("Error saving directory settings: {e}");
        return false;
    }
    match tokio::fs::write(settings_path(), text).await {
        Ok(()) => true,
        Err(e) => {
            eprintln!("Error saving directory settings: {e}");
            false
        }
    }
}

fn saved_directory(settings: &Value) -> String {
    settings
        .get("autoPathsDirectory")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

#[tauri::command]
pub async fn file_get_directory() -> Option<String> {
    let saved = saved_directory(&load_settings().await);
    if !saved.trim().is_empty() {
        if tokio::fs::try_exists(&saved).await.unwrap_or(false) {
            return Some(saved);
        }
        println!("Saved directory no longer accessible, falling back to default");
    }
    let default_dir = dirs::document_dir()?.join("AutoPaths");
    tokio::fs::try_exists(&default_dir)
        .await
        .unwrap_or(false)
        .then(|| display(&default_dir))
}

#[tauri::command]
pub async fn file_set_directory<R: Runtime>(window: WebviewWindow<R>) -> Option<String> {
    let selected = dialogs::pick_folder(&window, "Select AutoPaths Directory").await?;
    let mut settings = load_settings().await;
    if let Some(obj) = settings.as_object_mut() {
        obj.insert("autoPathsDirectory".into(), json!(selected));
    }
    save_settings(&settings).await;
    Some(selected)
}

#[tauri::command]
pub async fn file_select_directory<R: Runtime>(window: WebviewWindow<R>) -> Option<String> {
    dialogs::pick_folder(&window, "Select Directory").await
}

#[tauri::command]
pub async fn directory_get_settings() -> Value {
    load_settings().await
}

#[tauri::command]
pub async fn directory_save_settings(settings: Value) -> bool {
    save_settings(&settings).await
}

#[tauri::command]
pub async fn directory_get_saved_directory() -> String {
    saved_directory(&load_settings().await)
}

#[tauri::command]
pub async fn file_create_directory(dir_path: Option<String>) -> Result<bool> {
    let Some(dir_path) = dir_path.filter(|d| !d.trim().is_empty()) else {
        return Err("Invalid directory path".into());
    };
    let path = validate_arbitrary_path(&dir_path)?;
    tokio::fs::create_dir_all(path).await.map_err(|e| {
        eprintln!("Error creating directory: {e}");
        e.to_string()
    })?;
    Ok(true)
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryStats {
    total_files: usize,
    total_size: u64,
    /// Milliseconds since 1970.
    last_modified: f64,
}

#[tauri::command]
pub async fn file_get_directory_stats(dir_path: Option<String>) -> DirectoryStats {
    let Some(dir_path) = dir_path.filter(|d| !d.trim().is_empty()) else {
        return DirectoryStats::default();
    };
    let Ok(dir) = validate_arbitrary_path(&dir_path) else {
        return DirectoryStats::default();
    };
    let mut entries = match tokio::fs::read_dir(&dir).await {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!("Directory not accessible in file_get_directory_stats: {dir_path}: {e}");
            return DirectoryStats::default();
        }
    };
    let mut stats = DirectoryStats::default();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_project_file_path(&name) {
            continue;
        }
        let Ok(meta) = tokio::fs::metadata(entry.path()).await else {
            return DirectoryStats::default();
        };
        stats.total_files += 1;
        stats.total_size += meta.len();
        stats.last_modified = stats.last_modified.max(mtime_ms(&meta));
    }
    stats
}
