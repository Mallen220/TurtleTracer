// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Brings localStorage over from the Electron app on first launch: robot
//! profiles, command palette recents, plugin switches and the like. The
//! Electron app served the page from http://localhost:17218 (or the next
//! free port), and Chromium kept that origin's localStorage in LevelDB in the
//! same data folder this app uses.
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusty_leveldb::{LdbIterator, Options, DB};
use serde::Serialize;

use crate::paths::data_dir;

const MARKER: &str = "webview-migrated.json";
const PREFERRED_ORIGIN: &str = "http://localhost:17218";

#[derive(Serialize)]
pub struct LegacyStorage {
    /// localStorage keys and values to set where the page has none yet.
    storage: HashMap<String, String>,
    /// What couldn't be brought over, to tell the user once.
    notice: Option<String>,
}

/// Chromium stores each localStorage string with a leading format byte:
/// 0 for UTF-16LE, 1 for Latin-1.
pub fn decode_string(bytes: &[u8]) -> Option<String> {
    let (&format, rest) = bytes.split_first()?;
    match format {
        0 => {
            if rest.len() % 2 != 0 {
                return None;
            }
            let units: Vec<u16> = rest
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            String::from_utf16(&units).ok()
        }
        1 => Some(rest.iter().map(|&b| b as char).collect()),
        _ => None,
    }
}

/// Splits a localStorage record key, `_<origin>\0<key>`, into origin and key.
pub fn split_key(raw: &[u8]) -> Option<(String, String)> {
    let rest = raw.strip_prefix(b"_")?;
    let nul = rest.iter().position(|&b| b == 0)?;
    let origin = std::str::from_utf8(&rest[..nul]).ok()?.to_string();
    let key = decode_string(&rest[nul + 1..])?;
    Some((origin, key))
}

fn is_app_origin(origin: &str) -> bool {
    origin
        .strip_prefix("http://localhost:")
        .is_some_and(|port| !port.is_empty() && port.bytes().all(|b| b.is_ascii_digit()))
}

/// The app's localStorage from a LevelDB folder, read from a copy so the
/// original is never written to. The preferred origin wins over others.
pub fn read_local_storage(leveldb_dir: &Path) -> HashMap<String, String> {
    let mut result = HashMap::new();
    let Ok(copy) = copy_dir(leveldb_dir) else {
        return result;
    };
    let options = Options {
        create_if_missing: false,
        ..Options::default()
    };
    let records = DB::open(&copy, options).ok().and_then(|mut db| {
        let mut iter = db.new_iter().ok()?;
        let mut records = Vec::new();
        let (mut k, mut v) = (Vec::new(), Vec::new());
        while iter.advance() {
            if iter.current(&mut k, &mut v) {
                records.push((k.clone(), v.clone()));
            }
        }
        Some(records)
    });
    let _ = std::fs::remove_dir_all(&copy);

    let mut others = HashMap::new();
    for (raw_key, raw_value) in records.unwrap_or_default() {
        let Some((origin, key)) = split_key(&raw_key) else {
            continue;
        };
        if !is_app_origin(&origin) {
            continue;
        }
        let Some(value) = decode_string(&raw_value) else {
            continue;
        };
        if origin == PREFERRED_ORIGIN {
            result.insert(key, value);
        } else {
            others.insert(key, value);
        }
    }
    for (key, value) in others {
        result.entry(key).or_insert(value);
    }
    result
}

fn copy_dir(dir: &Path) -> std::io::Result<PathBuf> {
    let dest = std::env::temp_dir().join(format!("turtle-tracer-ls-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::create_dir_all(&dest)?;
    for entry in std::fs::read_dir(dir)?.flatten() {
        let name = entry.file_name();
        if name == "LOCK" || !entry.file_type()?.is_file() {
            continue;
        }
        std::fs::copy(entry.path(), dest.join(name))?;
    }
    Ok(dest)
}

/// Whether the Electron app kept GitHub working copies (in IndexedDB).
fn had_github_repos(data: &Path) -> bool {
    std::fs::read_dir(data.join("IndexedDB"))
        .map(|entries| {
            entries.flatten().any(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("http_localhost_")
            })
        })
        .unwrap_or(false)
}

/// Whether the Electron app remembered a GitHub token (encrypted in a way
/// only Electron can read, so it can't be brought over).
fn had_github_token(data: &Path) -> bool {
    std::fs::read_to_string(data.join("github-token.json"))
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .is_some_and(|saved| saved.get("token").is_some())
}

pub fn legacy_storage(data: &Path) -> Option<LegacyStorage> {
    if data.join(MARKER).exists() {
        return None;
    }
    let storage = read_local_storage(&data.join("Local Storage").join("leveldb"));
    let (repos, token) = (had_github_repos(data), had_github_token(data));
    let notice = match (repos, token) {
        (false, false) => None,
        (true, false) => Some(
            "Turtle Tracer has a new desktop engine. Open your GitHub repositories again to keep working in them; uncommitted edits from the previous version weren't carried over.",
        ),
        (false, true) => Some(
            "Turtle Tracer has a new desktop engine. Please sign in to GitHub again; your saved token couldn't be carried over.",
        ),
        (true, true) => Some(
            "Turtle Tracer has a new desktop engine. Please sign in to GitHub again and reopen your repositories; uncommitted edits from the previous version weren't carried over.",
        ),
    }
    .map(String::from);
    Some(LegacyStorage { storage, notice })
}

#[tauri::command]
pub fn take_legacy_web_storage() -> Option<LegacyStorage> {
    legacy_storage(&data_dir())
}

/// The page has stored what it was given; don't offer it again.
#[tauri::command]
pub fn finish_legacy_migration() {
    let data = data_dir();
    let _ = std::fs::create_dir_all(&data);
    if let Err(e) = std::fs::write(data.join(MARKER), b"{\"migrated\":true}") {
        eprintln!("Failed to record the localStorage migration: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn latin1(s: &str) -> Vec<u8> {
        let mut out = vec![1];
        out.extend(s.bytes());
        out
    }

    fn utf16(s: &str) -> Vec<u8> {
        let mut out = vec![0];
        for unit in s.encode_utf16() {
            out.extend(unit.to_le_bytes());
        }
        out
    }

    fn record_key(origin: &str, key: &str) -> Vec<u8> {
        let mut out = format!("_{origin}\0").into_bytes();
        out.extend(latin1(key));
        out
    }

    #[test]
    fn decodes_both_string_formats() {
        assert_eq!(decode_string(&latin1("abc")).as_deref(), Some("abc"));
        assert_eq!(
            decode_string(&utf16("Größe 🐢")).as_deref(),
            Some("Größe 🐢")
        );
        assert_eq!(decode_string(&[]), None);
        assert_eq!(decode_string(&[7, 1]), None);
        assert_eq!(
            split_key(&record_key("http://localhost:17218", "robot-profiles")),
            Some(("http://localhost:17218".into(), "robot-profiles".into()))
        );
        assert_eq!(split_key(b"META:http://localhost:17218"), None);
    }

    #[test]
    fn reads_the_app_origins_from_leveldb_preferring_the_usual_port() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("leveldb");
        {
            let mut db = DB::open(&dir, Options::default()).unwrap();
            db.put(b"VERSION", b"1").unwrap();
            db.put(
                &record_key("http://localhost:17218", "profiles"),
                &utf16("[1]"),
            )
            .unwrap();
            db.put(
                &record_key("http://localhost:17219", "profiles"),
                &latin1("[2]"),
            )
            .unwrap();
            db.put(
                &record_key("http://localhost:17219", "recents"),
                &latin1("[\"a\"]"),
            )
            .unwrap();
            db.put(&record_key("https://example.com", "other"), &latin1("x"))
                .unwrap();
            db.flush().unwrap();
        }
        let storage = read_local_storage(&dir);
        assert_eq!(storage.len(), 2);
        assert_eq!(storage["profiles"], "[1]");
        assert_eq!(storage["recents"], "[\"a\"]");
    }

    #[test]
    fn runs_once_and_explains_what_was_left_behind() {
        let tmp = tempfile::tempdir().unwrap();
        let data = tmp.path();
        assert!(legacy_storage(data).unwrap().notice.is_none());

        std::fs::create_dir_all(data.join("IndexedDB/http_localhost_17218.indexeddb.leveldb"))
            .unwrap();
        std::fs::write(
            data.join("github-token.json"),
            r#"{"token":"x","savedAt":0}"#,
        )
        .unwrap();
        let notice = legacy_storage(data).unwrap().notice.unwrap();
        assert!(notice.contains("sign in to GitHub") && notice.contains("reopen"));

        std::fs::write(data.join(MARKER), "{}").unwrap();
        assert!(legacy_storage(data).is_none());
    }
}
