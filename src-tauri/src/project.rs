// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Looking through a robot project, to find what the code Turtle Tracer
//! writes has to match: where the team keeps its Pedro constants, for one.
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::paths::validate_arbitrary_path;

/// Folders that never hold a team's own code.
const SKIPPED_FOLDERS: [&str; 4] = ["build", "node_modules", "out", "libs"];
const MAX_DEPTH: usize = 20;
const MAX_RESULTS: usize = 500;

fn option(options: &Option<Value>, name: &str, default: usize) -> usize {
    options
        .as_ref()
        .and_then(|o| o.get(name))
        .and_then(Value::as_f64)
        .filter(|n| *n >= 1.0)
        .map(|n| n as usize)
        .unwrap_or(default)
}

/// The files under `root` whose names end with one of `endings`, skipping
/// build output and hidden folders, sorted by name within each folder.
pub fn find_files_under(
    root: &Path,
    endings: &[String],
    max_depth: usize,
    max_results: usize,
) -> Vec<PathBuf> {
    let wanted: Vec<&String> = endings.iter().filter(|e| !e.is_empty()).collect();
    let mut found = Vec::new();
    if wanted.is_empty() {
        return found;
    }

    fn walk(
        dir: &Path,
        depth: usize,
        wanted: &[&String],
        max_depth: usize,
        max_results: usize,
        found: &mut Vec<PathBuf>,
    ) {
        if depth > max_depth || found.len() >= max_results {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            (name.to_lowercase(), name)
        });
        for entry in entries {
            if found.len() >= max_results {
                return;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if name.starts_with('.') || SKIPPED_FOLDERS.contains(&name.as_str()) {
                    continue;
                }
                walk(
                    &entry.path(),
                    depth + 1,
                    wanted,
                    max_depth,
                    max_results,
                    found,
                );
            } else if kind.is_file() && wanted.iter().any(|e| name.ends_with(e.as_str())) {
                found.push(entry.path());
            }
        }
    }

    walk(root, 0, &wanted, max_depth, max_results, &mut found);
    found
}

#[tauri::command]
pub async fn project_find_files(
    root: String,
    endings: Option<Vec<Value>>,
    options: Option<Value>,
) -> Vec<String> {
    let Ok(root) = validate_arbitrary_path(&root) else {
        return vec![];
    };
    let endings: Vec<String> = endings
        .unwrap_or_default()
        .into_iter()
        .filter_map(|e| e.as_str().map(String::from))
        .collect();
    let max_depth = option(&options, "maxDepth", 12).min(MAX_DEPTH);
    let max_results = option(&options, "maxResults", 50).min(MAX_RESULTS);
    tokio::task::spawn_blocking(move || find_files_under(&root, &endings, max_depth, max_results))
        .await
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn finds_matching_files_and_skips_build_output() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("TeamCode/src/pedro")).unwrap();
        fs::create_dir_all(root.join("build/gen")).unwrap();
        fs::create_dir_all(root.join(".gradle")).unwrap();
        fs::write(root.join("TeamCode/src/pedro/Constants.java"), "").unwrap();
        fs::write(root.join("TeamCode/src/pedro/Other.kt"), "").unwrap();
        fs::write(root.join("build/gen/Constants.java"), "").unwrap();
        fs::write(root.join(".gradle/Constants.java"), "").unwrap();

        let found = find_files_under(root, &["Constants.java".into()], 12, 50);
        assert_eq!(found, vec![root.join("TeamCode/src/pedro/Constants.java")]);
    }

    #[test]
    fn stops_at_the_depth_and_result_limits() {
        let tmp = tempfile::tempdir().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("a/b/c")).unwrap();
        fs::write(root.join("a/b/c/deep.java"), "").unwrap();
        for i in 0..5 {
            fs::write(root.join(format!("f{i}.java")), "").unwrap();
        }
        assert_eq!(find_files_under(root, &[".java".into()], 1, 50).len(), 5);
        assert_eq!(find_files_under(root, &[".java".into()], 12, 3).len(), 3);
        assert!(find_files_under(root, &["".into()], 12, 50).is_empty());
    }
}
