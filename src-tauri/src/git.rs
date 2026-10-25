// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Git status and file contents at HEAD, from the `git` command line (which
//! is what simple-git ran in the Electron app). Without git, files are clean.
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tokio::process::Command;

fn git(dir: &Path) -> Command {
    let mut cmd = Command::new("git");
    cmd.arg("-C").arg(dir);
    cmd.kill_on_drop(true);
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: no console flashes up for each call.
        cmd.creation_flags(0x0800_0000);
    }
    cmd
}

async fn run(dir: &Path, args: &[&str]) -> Option<Vec<u8>> {
    let output = git(dir).args(args).output().await.ok()?;
    output.status.success().then_some(output.stdout)
}

/// The real (symlink-resolved) top folder of the repository holding `dir`.
async fn repo_root(dir: &Path) -> Option<PathBuf> {
    let inside = run(dir, &["rev-parse", "--is-inside-work-tree"]).await?;
    if String::from_utf8_lossy(&inside).trim() != "true" {
        return None;
    }
    let raw = run(dir, &["rev-parse", "--show-toplevel"]).await?;
    let root = String::from_utf8_lossy(&raw).trim().to_string();
    tokio::fs::canonicalize(root).await.ok()
}

/// How the file manager labels a file, from git's two status letters.
pub fn classify(index: char, working_dir: char) -> &'static str {
    if working_dir == '?' || working_dir == 'U' {
        "untracked"
    } else if working_dir != ' ' {
        "modified"
    } else if index != ' ' && index != '?' {
        "staged"
    } else {
        "clean"
    }
}

/// Parses `git status --porcelain -z` output into (path, index, working dir).
pub fn parse_porcelain(output: &[u8]) -> Vec<(String, char, char)> {
    let mut entries = Vec::new();
    let mut fields = output.split(|&b| b == 0).filter(|f| !f.is_empty());
    while let Some(field) = fields.next() {
        let text = String::from_utf8_lossy(field);
        let mut chars = text.chars();
        let (Some(x), Some(y), Some(' ')) = (chars.next(), chars.next(), chars.next()) else {
            continue;
        };
        entries.push((chars.as_str().to_string(), x, y));
        // A rename or copy is followed by the path it came from.
        if x == 'R' || x == 'C' {
            fields.next();
        }
    }
    entries
}

/// Git status of every changed file in the repository containing
/// `directory`, keyed by real absolute path. Files not listed are clean.
pub async fn git_statuses(directory: &Path) -> HashMap<PathBuf, String> {
    let mut statuses = HashMap::new();
    let Some(root) = repo_root(directory).await else {
        return statuses;
    };
    let Some(output) = run(directory, &["status", "--porcelain", "-z", "-u"]).await else {
        return statuses;
    };
    for (rel, x, y) in parse_porcelain(&output) {
        let abs = root.join(&rel);
        // Deleted files have no real path, so fall back to the plain one.
        let key = tokio::fs::canonicalize(&abs).await.unwrap_or(abs);
        statuses.insert(key, classify(x, y).to_string());
    }
    statuses
}

#[tauri::command]
pub async fn git_show(file_path: String) -> Option<String> {
    let file = Path::new(&file_path);
    let root = repo_root(file.parent()?).await?;
    let real = tokio::fs::canonicalize(file).await.ok()?;
    let rel = real.strip_prefix(&root).ok()?;
    let rel = rel.to_string_lossy().replace('\\', "/");
    let content = run(&root, &["show", &format!("HEAD:{rel}")]).await?;
    Some(String::from_utf8_lossy(&content).into_owned())
}

#[tauri::command]
pub async fn git_status(directory: Option<String>) -> HashMap<String, String> {
    let Some(directory) = directory.filter(|d| !d.trim().is_empty()) else {
        return HashMap::new();
    };
    git_statuses(Path::new(&directory))
        .await
        .into_iter()
        .map(|(k, v)| (k.to_string_lossy().into_owned(), v))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_like_the_file_manager_expects() {
        assert_eq!(classify('?', '?'), "untracked");
        assert_eq!(classify('U', 'U'), "untracked");
        assert_eq!(classify(' ', 'M'), "modified");
        assert_eq!(classify('M', 'M'), "modified");
        assert_eq!(classify('A', ' '), "staged");
        assert_eq!(classify(' ', ' '), "clean");
    }

    #[test]
    fn parses_porcelain_with_renames_and_spaces() {
        let out = b" M a file.turt\0R  new.turt\0old.turt\0?? dir/x.turt\0";
        assert_eq!(
            parse_porcelain(out),
            vec![
                ("a file.turt".to_string(), ' ', 'M'),
                ("new.turt".to_string(), 'R', ' '),
                ("dir/x.turt".to_string(), '?', '?'),
            ]
        );
    }

    #[tokio::test]
    async fn reports_statuses_from_a_real_repository() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let ok = std::process::Command::new("git")
            .arg("-C")
            .arg(dir)
            .arg("init")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false);
        if !ok {
            return; // No git on this machine.
        }
        std::fs::write(dir.join("new.turt"), "{}").unwrap();
        let statuses = git_statuses(dir).await;
        let key = std::fs::canonicalize(dir.join("new.turt")).unwrap();
        assert_eq!(statuses.get(&key).map(String::as_str), Some("untracked"));
    }
}
