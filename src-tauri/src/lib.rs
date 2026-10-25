// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! The desktop app: one Rust command for each thing the page asks of the
//! system (see src/utils/tauriBridge.ts for the page's side).
mod app;
mod dialogs;
mod directory;
mod files;
mod git;
mod github;
mod java_follow;
mod menu;
mod migrate;
mod paths;
mod plugins;
#[cfg(debug_assertions)]
mod probe;
mod project;
mod store;
mod telemetry;
mod updater;

use std::time::Duration;

#[cfg(target_os = "macos")]
use tauri::RunEvent;

use app::AppState;
use paths::{data_dir, is_project_file_path};

/// How long `--smoke-test` waits for the page before failing.
const SMOKE_TEST_TIMEOUT: Duration = Duration::from_secs(30);

pub fn run() {
    let smoke_test = std::env::args().any(|a| a == "--smoke-test");
    // Windows and Linux pass a double-clicked file as the last argument.
    let launch_file = std::env::args()
        .skip(1)
        .last()
        .filter(|a| !cfg!(target_os = "macos") && is_project_file_path(a));

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Someone ran a second copy: show this one instead.
            match app::focused_or_last(app) {
                Some(window) => app::focus(&window),
                None => app::open_window(app),
            }
            if let Some(file) = argv.last().filter(|a| is_project_file_path(a)) {
                app::handle_opened_file(app, file.clone());
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(smoke_test, launch_file))
        .manage(java_follow::JavaFollow::default())
        .manage(telemetry::Telemetry::default())
        .manage(github::GitHub::system(data_dir().join("github-token.json")))
        .menu(menu::build)
        .on_menu_event(menu::handle)
        .setup(move |app| {
            if let Err(e) = std::fs::create_dir_all(data_dir()) {
                eprintln!("Failed to create the data folder: {e}");
            }
            app::create_window(app.handle())?;
            let handle = app.handle().clone();
            std::thread::spawn(move || plugins::ensure_default_plugins(&handle));
            if smoke_test {
                std::thread::spawn(|| {
                    std::thread::sleep(SMOKE_TEST_TIMEOUT);
                    eprintln!("Smoke test: the page didn't start in time.");
                    std::process::exit(1);
                });
            } else {
                updater::check_on_startup(app.handle());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::renderer_ready,
            app::app_close_approved,
            app::app_open_external,
            app::app_get_app_data_path,
            app::app_get_version,
            app::app_is_windows_store,
            directory::file_get_directory,
            directory::file_set_directory,
            directory::file_select_directory,
            directory::directory_get_settings,
            directory::directory_save_settings,
            directory::directory_get_saved_directory,
            directory::file_create_directory,
            directory::file_get_directory_stats,
            files::file_copy,
            files::file_choose_project,
            files::file_rename,
            files::file_list,
            files::file_read,
            files::file_write,
            files::file_show_save_dialog,
            files::file_write_base64,
            files::export_pp,
            files::file_delete,
            files::file_exists,
            files::file_resolve_path,
            files::file_make_relative_path,
            git::git_show,
            git::git_status,
            github::github_token_status,
            github::github_token_set,
            github::github_token_clear,
            github::github_fetch,
            java_follow::java_choose_file,
            java_follow::java_follow,
            java_follow::java_unfollow,
            migrate::take_legacy_web_storage,
            migrate::finish_legacy_migration,
            plugins::plugins_list,
            plugins::plugins_read,
            plugins::plugins_delete,
            plugins::plugins_open_folder,
            project::project_find_files,
            telemetry::telemetry_connect,
            telemetry::telemetry_disconnect,
            updater::update_check,
            updater::update_download,
            updater::update_skip,
        ])
        .build(tauri::generate_context!())
        .expect("error while starting Turtle Tracer");

    app.run(|_app, _event| {
        // macOS hands over double-clicked files as an event instead.
        #[cfg(target_os = "macos")]
        if let RunEvent::Opened { urls } = _event {
            for url in urls {
                let Ok(path) = url.to_file_path() else {
                    continue;
                };
                let path = path.to_string_lossy().into_owned();
                if is_project_file_path(&path) {
                    app::handle_opened_file(_app, path);
                }
            }
        }
    });
}
