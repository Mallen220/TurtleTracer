// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Following a Java or Kotlin file: the page picks one and is told each time
//! it's saved, so the field shows what the code in the team's editor says.
//!
//! Only a file this process offered the page (picked in the dialog or listed
//! in a folder) can be followed, so a path the page makes up is never polled.
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

use tauri::{Emitter, Runtime, WebviewWindow};

use crate::dialogs::{self, Filter};
use crate::paths::{normalize, validate_arbitrary_path};

/// How often the file is checked for a save. Editors such as Android Studio
/// save by writing a new file and renaming it over the old one, so the file
/// is polled rather than watched for events.
const CHECK_INTERVAL: Duration = Duration::from_millis(250);

/// Whether a path is a Java or Kotlin file, the kinds the page can follow.
pub fn is_code_file_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".java") || lower.ends_with(".kt")
}

#[derive(Default)]
pub struct JavaFollow {
    offered: Mutex<HashSet<PathBuf>>,
    /// The stop flag of what each window follows, by window label.
    following: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// What a save changes: (modified time, size). A missing file reads as zero,
/// as with Node's fs.watchFile, so a save by rename shows up as a change.
fn signature(path: &Path) -> (Option<SystemTime>, u64) {
    match std::fs::metadata(path) {
        Ok(meta) => (meta.modified().ok(), meta.len()),
        Err(_) => (None, 0),
    }
}

impl JavaFollow {
    /// Records a code file the page may now follow. Anything else is ignored.
    pub fn offer(&self, path: &Path) {
        if is_code_file_path(&path.to_string_lossy()) {
            self.offered.lock().unwrap().insert(normalize(path));
        }
    }

    /// The offered path equal to `path`; the result comes from the registry.
    pub fn find_offered(&self, path: &Path) -> Option<PathBuf> {
        let wanted = normalize(path);
        self.offered.lock().unwrap().get(&wanted).cloned()
    }

    pub fn stop(&self, label: &str) {
        if let Some(stop) = self.following.lock().unwrap().remove(label) {
            stop.store(true, Ordering::Relaxed);
        }
    }

    /// Polls `path`, calling `changed` after each save until stopped.
    pub fn watch(&self, label: &str, path: PathBuf, changed: impl Fn() + Send + 'static) {
        self.stop(label);
        let stop = Arc::new(AtomicBool::new(false));
        self.following
            .lock()
            .unwrap()
            .insert(label.to_string(), stop.clone());
        let mut previous = signature(&path);
        std::thread::spawn(move || {
            while !stop.load(Ordering::Relaxed) {
                std::thread::sleep(CHECK_INTERVAL);
                let current = signature(&path);
                if current != previous && !stop.load(Ordering::Relaxed) {
                    previous = current;
                    changed();
                }
            }
        });
    }

    pub fn follow<R: Runtime>(
        &self,
        window: &WebviewWindow<R>,
        file_path: &str,
    ) -> Result<bool, String> {
        let requested = validate_arbitrary_path(file_path)?;
        if !is_code_file_path(file_path) {
            return Err("Only Java and Kotlin files can be followed.".into());
        }
        let Some(resolved) = self.find_offered(&requested) else {
            return Err("Only a file chosen in the file dialog or listed in the file manager can be followed.".into());
        };
        let label = window.label().to_string();
        let window = window.clone();
        let reported = file_path.to_string();
        self.watch(&label, resolved, move || {
            let _ = window.emit_to(window.label(), "java:changed", &reported);
        });
        Ok(true)
    }
}

#[tauri::command]
pub async fn java_choose_file<R: Runtime>(
    window: WebviewWindow<R>,
    follow: tauri::State<'_, JavaFollow>,
) -> Result<Option<String>, String> {
    let chosen = dialogs::pick_file(
        &window,
        "Follow a Java or Kotlin file",
        vec![Filter::new("Java or Kotlin", &["java", "kt"])],
    )
    .await;
    if let Some(chosen) = &chosen {
        follow.offer(Path::new(chosen));
    }
    Ok(chosen)
}

#[tauri::command]
pub fn java_follow<R: Runtime>(
    window: WebviewWindow<R>,
    follow: tauri::State<'_, JavaFollow>,
    file_path: String,
) -> Result<bool, String> {
    follow.follow(&window, &file_path)
}

#[tauri::command]
pub fn java_unfollow<R: Runtime>(
    window: WebviewWindow<R>,
    follow: tauri::State<'_, JavaFollow>,
) -> bool {
    follow.stop(window.label());
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;

    #[test]
    fn only_offered_code_files_are_known() {
        let follow = JavaFollow::default();
        follow.offer(Path::new("/team/Auto.java"));
        follow.offer(Path::new("/team/notes.txt"));
        assert_eq!(
            follow.find_offered(Path::new("/team//./Auto.java")),
            Some(PathBuf::from("/team/Auto.java"))
        );
        assert!(follow.find_offered(Path::new("/team/notes.txt")).is_none());
        assert!(follow.find_offered(Path::new("/team/Other.kt")).is_none());
        assert!(is_code_file_path("A.KT") && !is_code_file_path("a.js"));
    }

    #[test]
    fn reports_saves_including_save_by_rename_and_stops() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("Auto.java");
        std::fs::write(&file, "a").unwrap();
        let follow = JavaFollow::default();
        let (tx, rx) = mpsc::channel();
        follow.watch("w", file.clone(), move || {
            let _ = tx.send(());
        });

        std::fs::write(&file, "ab").unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok());

        let tmp_file = tmp.path().join("Auto.java.tmp");
        std::fs::write(&tmp_file, "abcd").unwrap();
        std::fs::rename(&tmp_file, &file).unwrap();
        assert!(rx.recv_timeout(Duration::from_secs(3)).is_ok());

        follow.stop("w");
        std::thread::sleep(CHECK_INTERVAL * 2);
        while rx.try_recv().is_ok() {}
        std::fs::write(&file, "abcdef").unwrap();
        assert!(rx.recv_timeout(CHECK_INTERVAL * 4).is_err());
    }
}
