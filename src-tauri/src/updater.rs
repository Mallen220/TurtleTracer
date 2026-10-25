// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Checks GitHub for a newer release and tells the page, which shows the
//! update banner. Installing runs the install script in a terminal on macOS
//! and Linux, and opens the installer download on Windows.
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::paths::data_dir;

const RELEASES_URL: &str = "https://api.github.com/repos/Mallen220/TurtleTracer/releases/latest";
const INSTALL_SCRIPT_URL: &str =
    "https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh";
const SAFE_PATH: &str = "/usr/bin:/bin:/usr/sbin:/sbin";

/// Only version strings that are safe to put in a shell command (and inside
/// an AppleScript string) are passed on; anything else falls back to the
/// installer's own "which version?" question.
fn is_safe_version(version: &str) -> bool {
    Regex::new(r"^\d+\.\d+\.\d+(?:[-+.][0-9A-Za-z.+-]*)?$")
        .unwrap()
        .is_match(version)
}

pub fn build_install_command(version: &str) -> String {
    let version_arg = if is_safe_version(version) {
        format!(" --version {version}")
    } else {
        String::new()
    };
    format!("/usr/bin/curl -fsSL {INSTALL_SCRIPT_URL} | /bin/bash -s --{version_arg}")
}

/// Compares dotted versions part by part; parts that aren't numbers count as 0.
pub fn is_newer_version(latest: &str, current: &str) -> bool {
    let parts = |v: &str| -> Vec<f64> { v.split('.').map(|p| p.parse().unwrap_or(0.0)).collect() };
    let (latest, current) = (parts(latest), parts(current));
    for i in 0..latest.len().max(current.len()) {
        let l = latest.get(i).copied().unwrap_or(0.0);
        let c = current.get(i).copied().unwrap_or(0.0);
        if l > c {
            return true;
        }
        if l < c {
            return false;
        }
    }
    false
}

fn settings_path() -> PathBuf {
    data_dir().join("updater-settings.json")
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UpdaterSettings {
    #[serde(default)]
    skipped_versions: Vec<String>,
}

fn load_skipped() -> Vec<String> {
    std::fs::read_to_string(settings_path())
        .ok()
        .and_then(|text| serde_json::from_str::<UpdaterSettings>(&text).ok())
        .map(|s| s.skipped_versions)
        .unwrap_or_default()
}

fn save_skipped(skipped: &[String]) {
    let settings = json!({
        "skippedVersions": skipped,
        "lastUpdated": seconds_now(),
    });
    if let Err(e) = std::fs::write(
        settings_path(),
        serde_json::to_string_pretty(&settings).unwrap_or_default(),
    ) {
        eprintln!("Error saving updater settings: {e}");
    }
}

/// Seconds since 1970, as text: enough to see when a version was skipped.
fn seconds_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

/// The window that hears about updates: the focused one, or any.
fn target_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|w| w.is_focused().unwrap_or(false))
        .or_else(|| windows.values().next())
        .cloned()
}

async fn fetch_latest() -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("TurtleTracer/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(RELEASES_URL)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "GitHub API responded with status: {}",
            response.status().as_u16()
        ));
    }
    response.json().await.map_err(|e| e.to_string())
}

/// Looks for a newer release. `manual` checks ignore skipped versions,
/// show the banner straight away, and return errors instead of logging them.
pub async fn check_for_updates<R: Runtime>(
    app: &AppHandle<R>,
    manual: bool,
) -> Result<Value, String> {
    println!("Checking for updates...");
    let release = match fetch_latest().await {
        Ok(release) => release,
        Err(e) => {
            eprintln!("Failed to check for updates: {e}");
            if manual {
                return Err(e);
            }
            return Ok(json!({ "updateAvailable": false, "error": e }));
        }
    };
    let latest = release
        .get("tag_name")
        .and_then(Value::as_str)
        .unwrap_or("")
        .replace('v', "");
    let current = app.package_info().version.to_string();
    println!("Current: {current}, Latest: {latest}");

    if !manual && load_skipped().contains(&latest) {
        println!("Version {latest} was previously skipped.");
        return Ok(json!({ "updateAvailable": false, "reason": "skipped" }));
    }
    if !is_newer_version(&latest, &current) {
        println!("Application is up to date.");
        return Ok(json!({ "updateAvailable": false, "reason": "latest" }));
    }

    if crate::store::is_windows_store() {
        if let Some(window) = target_window(app) {
            let _ = window.emit_to(
                window.label(),
                "store-update-available",
                json!({ "version": latest }),
            );
        }
    } else {
        let data = json!({
            "version": latest,
            "releaseNotes": release.get("body").cloned().unwrap_or(Value::Null),
            "url": release.get("html_url").cloned().unwrap_or(Value::Null),
        });
        let app = app.clone();
        let delay = if manual { 0 } else { 3000 };
        tauri::async_runtime::spawn(async move {
            // Wait a bit for the window to be fully ready.
            tokio::time::sleep(Duration::from_millis(delay)).await;
            if let Some(window) = target_window(&app) {
                let _ = window.emit_to(window.label(), "update-available", data);
            }
        });
    }
    Ok(json!({ "updateAvailable": true, "version": latest, "releaseData": release }))
}

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &str) {
    if crate::app::is_web_url(url) {
        use tauri_plugin_opener::OpenerExt;
        if let Err(e) = app.opener().open_url(url, None::<&str>) {
            eprintln!("Failed to open link: {url}: {e}");
        }
    }
}

#[cfg(target_os = "linux")]
fn open_terminal_linux(command: &str) -> bool {
    let terminals: [(&str, &[&str]); 4] = [
        ("/usr/bin/gnome-terminal", &["--", "/bin/bash", "-c"]),
        ("/usr/bin/x-terminal-emulator", &["-e", "/bin/bash", "-c"]),
        ("/usr/bin/konsole", &["-e", "/bin/bash", "-c"]),
        ("/usr/bin/xterm", &["-e", "/bin/bash", "-c"]),
    ];
    terminals.iter().any(|(terminal, args)| {
        std::path::Path::new(terminal).exists()
            && Command::new(terminal)
                .args(*args)
                .arg(command)
                .env("PATH", SAFE_PATH)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .is_ok()
    })
}

pub fn download_and_install<R: Runtime>(app: &AppHandle<R>, version: &str, releases_url: &str) {
    if cfg!(target_os = "windows") {
        let url = format!(
            "https://github.com/Mallen220/TurtleTracer/releases/download/v{version}/Turtle-Tracer-Setup-{version}.exe"
        );
        if is_safe_version(version) {
            open_in_browser(app, &url);
        } else {
            open_in_browser(app, releases_url);
        }
    } else if cfg!(target_os = "macos") {
        let command = build_install_command(version);
        let script = format!("tell application \"Terminal\" to do script \"{command}\"");
        let launched = Command::new("/usr/bin/osascript")
            .args([
                "-e",
                &script,
                "-e",
                "tell application \"Terminal\" to activate",
            ])
            .env("PATH", SAFE_PATH)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .is_ok();
        if !launched {
            open_in_browser(app, releases_url);
        }
    } else {
        #[cfg(target_os = "linux")]
        if open_terminal_linux(&build_install_command(version)) {
            return;
        }
        open_in_browser(app, releases_url);
    }
}

/// The automatic check, a few seconds after the first window opens.
pub fn check_on_startup<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(3)).await;
        let _ = check_for_updates(&app, false).await;
    });
}

#[tauri::command]
pub async fn update_check<R: Runtime>(app: AppHandle<R>) -> Value {
    match check_for_updates(&app, true).await {
        Ok(Value::Object(mut result)) => {
            result.insert("success".into(), json!(true));
            Value::Object(result)
        }
        Ok(other) => json!({ "success": true, "result": other }),
        Err(e) => {
            eprintln!("Error during manual update check: {e}");
            json!({ "success": false, "error": e })
        }
    }
}

#[tauri::command]
pub fn update_download<R: Runtime>(app: AppHandle<R>, version: String, url: Option<String>) {
    download_and_install(&app, &version, url.as_deref().unwrap_or(""));
}

#[tauri::command]
pub fn update_skip(version: String) {
    let mut skipped = load_skipped();
    if !skipped.contains(&version) {
        skipped.push(version.clone());
        save_skipped(&skipped);
        println!("User skipped version {version}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn install_command_only_passes_safe_versions() {
        assert_eq!(
            build_install_command("2.7.0"),
            format!("/usr/bin/curl -fsSL {INSTALL_SCRIPT_URL} | /bin/bash -s -- --version 2.7.0")
        );
        assert!(build_install_command("2.7.0-beta.1").ends_with("--version 2.7.0-beta.1"));
        assert!(build_install_command("2.7.0\"; rm -rf ~").ends_with("-s --"));
        assert!(build_install_command("$(evil)").ends_with("-s --"));
        assert!(build_install_command("").ends_with("-s --"));
    }

    #[test]
    fn compares_versions_part_by_part() {
        assert!(is_newer_version("2.7.0", "2.6.0"));
        assert!(is_newer_version("2.10.0", "2.9.9"));
        assert!(is_newer_version("3", "2.9.9"));
        assert!(!is_newer_version("2.6.0", "2.6.0"));
        assert!(!is_newer_version("2.6", "2.6.0"));
        assert!(!is_newer_version("2.5.9", "2.6.0"));
    }
}
