// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Path checks shared by the commands, and where the app keeps its data.
use std::path::{Component, Path, PathBuf};

const PROJECT_EXTENSIONS: [&str; 2] = [".turt", ".pp"];

/// The folder the Electron app used ("userData", named after package.json's
/// `name`), so settings, plugins and directory settings carry over.
/// `TT_DATA_DIR` overrides it, for tests.
pub fn data_dir() -> PathBuf {
    const FOLDER: &str = "turtle-tracer";
    if let Some(dir) = std::env::var_os("TT_DATA_DIR") {
        return PathBuf::from(dir);
    }
    if let Some(dir) = crate::store::local_state_dir() {
        return dir.join(FOLDER);
    }
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join(FOLDER)
}

pub fn plugins_dir() -> PathBuf {
    data_dir().join("plugins")
}

/// Whether a file path is a project file.
pub fn is_project_file_path(file_path: &str) -> bool {
    let lower = file_path.to_lowercase();
    PROJECT_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

/// Collapses `.` and repeated separators, like Node's `path.normalize` does
/// for paths without `..`.
pub fn normalize(path: &Path) -> PathBuf {
    path.components()
        .filter(|c| !matches!(c, Component::CurDir))
        .collect()
}

/// Resolves `..` too, without touching the disk (Node's `path.resolve`).
pub fn normalize_lexically(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other),
        }
    }
    out
}

/// Validates an arbitrary absolute path from the page: a string with no NUL
/// bytes and no `..`, that is absolute once normalized.
pub fn validate_arbitrary_path(input: &str) -> Result<PathBuf, String> {
    if input.contains('\0') {
        return Err("Invalid path: contains null bytes".into());
    }
    if input.contains("..") {
        return Err("Invalid path: contains traversal sequences".into());
    }
    let normalized = normalize(Path::new(input));
    if !normalized.is_absolute() {
        return Err("Invalid path: must be absolute".into());
    }
    Ok(normalized)
}

/// Validates that a path stays inside `base`.
pub fn validate_safe_path(input: &Path, base: &Path) -> Result<PathBuf, String> {
    if input.to_string_lossy().contains('\0') {
        return Err("Invalid path: contains null bytes".into());
    }
    let normalized = normalize_lexically(input);
    if !normalized.starts_with(normalize_lexically(base)) {
        return Err("Invalid path: traversal detected".into());
    }
    Ok(normalized)
}

/// Node's `path.resolve(path.dirname(base), relative)`.
pub fn resolve_from(base: &str, relative: &str) -> String {
    let dir = Path::new(base).parent().unwrap_or(Path::new(""));
    normalize_lexically(&dir.join(relative))
        .to_string_lossy()
        .into_owned()
}

fn same_component(a: &Component, b: &Component) -> bool {
    if cfg!(windows) {
        a.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
    } else {
        a == b
    }
}

/// Node's `path.relative(path.dirname(base), target)`.
pub fn relative_from(base: &str, target: &str) -> String {
    let from = normalize_lexically(Path::new(base).parent().unwrap_or(Path::new("")));
    let to = normalize_lexically(Path::new(target));
    let from: Vec<_> = from.components().collect();
    let to: Vec<_> = to.components().collect();
    let common = from
        .iter()
        .zip(&to)
        .take_while(|(a, b)| same_component(a, b))
        .count();
    let mut out = PathBuf::new();
    for _ in common..from.len() {
        out.push("..");
    }
    for part in &to[common..] {
        out.push(part);
    }
    out.to_string_lossy().into_owned()
}

/// A path as the page sees it.
pub fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arbitrary_paths_must_be_absolute_and_plain() {
        assert!(validate_arbitrary_path("relative/file.turt").is_err());
        assert!(validate_arbitrary_path("/a/../etc/passwd").is_err());
        assert!(validate_arbitrary_path("/a/b\0c").is_err());
        assert_eq!(
            validate_arbitrary_path("/a//b/./c.turt").unwrap(),
            PathBuf::from("/a/b/c.turt")
        );
    }

    #[test]
    fn safe_paths_stay_inside_their_base() {
        let base = Path::new("/data/app");
        assert!(validate_safe_path(Path::new("/data/app/plugins"), base).is_ok());
        assert!(validate_safe_path(Path::new("/data/app"), base).is_ok());
        assert!(validate_safe_path(Path::new("/data/app/../other"), base).is_err());
        assert!(validate_safe_path(Path::new("/data/apple"), base).is_err());
    }

    #[test]
    fn project_files_are_turt_and_pp() {
        assert!(is_project_file_path("/x/Auto.TURT"));
        assert!(is_project_file_path("legacy.pp"));
        assert!(!is_project_file_path("notes.txt"));
        assert!(!is_project_file_path(""));
    }

    #[test]
    fn resolves_and_relativizes_like_node() {
        assert_eq!(resolve_from("/a/b/main.turt", "../c/m.turt"), "/a/c/m.turt");
        assert_eq!(resolve_from("/a/b/main.turt", "/abs/x.turt"), "/abs/x.turt");
        assert_eq!(
            relative_from("/a/b/main.turt", "/a/c/m.turt"),
            "../c/m.turt"
        );
        assert_eq!(relative_from("/a/b/main.turt", "/a/b/m.turt"), "m.turt");
        assert_eq!(relative_from("/a/b/main.turt", "/a/b"), "");
    }
}
