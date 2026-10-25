// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Debug builds only: `TT_PROBE_SCRIPT=<file.js>` runs that script in the
//! first window once its page has started. Playwright can't drive the macOS
//! webview, so this is how the real app is checked from a script.
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{Runtime, WebviewWindow};

static RAN: AtomicBool = AtomicBool::new(false);

pub fn run_once<R: Runtime>(window: &WebviewWindow<R>) {
    let Some(path) = std::env::var_os("TT_PROBE_SCRIPT") else {
        return;
    };
    if RAN.swap(true, Ordering::Relaxed) {
        return;
    }
    match std::fs::read_to_string(&path) {
        Ok(script) => {
            if let Err(e) = window.eval(&script) {
                eprintln!("Probe: couldn't run the script: {e}");
            }
        }
        Err(e) => eprintln!("Probe: couldn't read {}: {e}", path.to_string_lossy()),
    }
}
