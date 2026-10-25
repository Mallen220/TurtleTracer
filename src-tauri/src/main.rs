// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Keeps a console window from opening alongside the app on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    turtle_tracer_lib::run();
}
