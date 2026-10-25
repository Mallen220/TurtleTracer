// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! The user's plugins folder. Plugin TypeScript is transpiled in the page.
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::paths::{data_dir, plugins_dir, validate_safe_path};

type Result<T> = std::result::Result<T, String>;

fn safe_plugins_dir() -> Result<PathBuf> {
    validate_safe_path(&plugins_dir(), &data_dir())
}

/// Whether `name` may be a plugin file: a plain file name ending in .js or .ts.
pub fn is_valid_plugin_name(name: &str) -> bool {
    let plain = Path::new(name).file_name().and_then(|n| n.to_str()) == Some(name);
    plain
        && name != "."
        && name != ".."
        && (name.ends_with(".js") || name.ends_with(".ts"))
        && name.len() > 3
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// The plugin file named `filename`, found by listing the folder rather than
/// by joining the name onto it.
fn resolve_plugin_file(base: &Path, filename: &str) -> Result<PathBuf> {
    if !is_valid_plugin_name(filename) {
        return Err("Invalid plugin filename".into());
    }
    let entries = std::fs::read_dir(base).map_err(|e| e.to_string())?;
    let found = entries
        .flatten()
        .find(|e| e.file_type().is_ok_and(|t| t.is_file()) && e.file_name() == filename)
        .ok_or("Plugin not found")?;
    let path = found.path();
    if path.parent() != Some(base) {
        return Err("Invalid path specified".into());
    }
    Ok(path)
}

#[tauri::command]
pub async fn plugins_list() -> Result<Vec<String>> {
    let dir = safe_plugins_dir()?;
    let listed = (|| {
        std::fs::create_dir_all(&dir)?;
        let mut names: Vec<String> = std::fs::read_dir(&dir)?
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|f| (f.ends_with(".js") || f.ends_with(".ts")) && !f.ends_with("turtle.d.ts"))
            .collect();
        names.sort();
        Ok::<_, std::io::Error>(names)
    })();
    Ok(listed.unwrap_or_else(|e| {
        eprintln!("Error listing plugins: {e}");
        vec![]
    }))
}

#[tauri::command]
pub async fn plugins_read(filename: String) -> Result<String> {
    let path = resolve_plugin_file(&safe_plugins_dir()?, &filename)?;
    tokio::fs::read_to_string(path).await.map_err(|e| {
        eprintln!("Error reading plugin: {e}");
        e.to_string()
    })
}

#[tauri::command]
pub async fn plugins_delete(filename: String) -> Result<bool> {
    let path = resolve_plugin_file(&safe_plugins_dir()?, &filename)?;
    tokio::fs::remove_file(path).await.map_err(|e| {
        eprintln!("Error deleting plugin: {e}");
        e.to_string()
    })?;
    Ok(true)
}

#[tauri::command]
pub async fn plugins_open_folder<R: Runtime>(app: AppHandle<R>) -> bool {
    let Ok(dir) = safe_plugins_dir() else {
        return false;
    };
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("Error opening plugins folder: {e}");
        return false;
    }
    match app.opener().open_path(dir.to_string_lossy(), None::<&str>) {
        Ok(()) => true,
        Err(e) => {
            eprintln!("Error opening plugins folder: {e}");
            false
        }
    }
}

/// Copies the bundled plugins into the user's plugins folder if missing.
pub fn ensure_default_plugins<R: Runtime>(app: &AppHandle<R>) {
    let dest_dir = plugins_dir();
    if let Err(e) = std::fs::create_dir_all(&dest_dir) {
        eprintln!("Failed to ensure default plugins: {e}");
        return;
    }
    let Ok(resources) = app.path().resource_dir() else {
        return;
    };
    let source_dir = resources.join("plugins");
    let entries = match std::fs::read_dir(&source_dir) {
        Ok(entries) => entries,
        Err(e) => {
            eprintln!(
                "Failed to read bundled plugins: {}: {e}",
                source_dir.display()
            );
            return;
        }
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !(name.ends_with(".js") || name.ends_with(".ts")) {
            continue;
        }
        let dest = dest_dir.join(&name);
        if !dest.exists() {
            if let Err(e) = std::fs::copy(entry.path(), &dest) {
                eprintln!("Failed to copy plugin {name}: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_names_are_plain_js_or_ts_files() {
        assert!(is_valid_plugin_name("Example-csv-exporter.ts"));
        assert!(is_valid_plugin_name("pink_theme.v2.js"));
        assert!(!is_valid_plugin_name("../evil.js"));
        assert!(!is_valid_plugin_name("dir/evil.js"));
        assert!(!is_valid_plugin_name("evil.sh"));
        assert!(!is_valid_plugin_name("spaced name.js"));
        assert!(!is_valid_plugin_name(".js"));
        assert!(!is_valid_plugin_name(""));
    }

    #[test]
    fn resolves_only_files_that_are_in_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("a.js"), "").unwrap();
        std::fs::create_dir(tmp.path().join("d.js")).unwrap();
        assert_eq!(
            resolve_plugin_file(tmp.path(), "a.js").unwrap(),
            tmp.path().join("a.js")
        );
        assert_eq!(
            resolve_plugin_file(tmp.path(), "b.js").unwrap_err(),
            "Plugin not found"
        );
        assert_eq!(
            resolve_plugin_file(tmp.path(), "d.js").unwrap_err(),
            "Plugin not found"
        );
    }
}
