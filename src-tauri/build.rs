//! Bakes the hosts the native helpers may reach into the app, from the same `.env` as the web app
//! (or the build environment in CI). They are fixed at build time on purpose: the webview cannot
//! widen them.

use std::collections::BTreeSet;
use std::{env, fs};

const SOURCES: &[&str] = &[
    "VITE_ANIME_SITE",
    "VITE_DRAMA_SITE",
    "VITE_DRAMA_PLAYLISTS",
    "VITE_LOCKED_HOSTS",
];

fn main() {
    println!("cargo:rerun-if-changed=../.env");
    let file = fs::read_to_string("../.env").unwrap_or_default();
    let from_file = |name: &str| -> Option<String> {
        file.lines()
            .filter_map(|line| line.trim().strip_prefix(&format!("{name}=")))
            .next()
            .map(|value| value.trim().trim_matches('"').to_string())
    };

    let mut hosts = BTreeSet::new();
    for name in SOURCES {
        println!("cargo:rerun-if-env-changed={name}");
        let value = env::var(name).ok().or_else(|| from_file(name)).unwrap_or_default();
        for entry in value.split(',').map(str::trim).filter(|entry| !entry.is_empty()) {
            // Either a URL ("https://site.example/path") or a bare domain ("cdn.example").
            let host = entry
                .split("://")
                .nth(1)
                .unwrap_or(entry)
                .split(['/', '?', ':'])
                .next()
                .unwrap_or_default()
                .to_lowercase();
            if !host.is_empty() {
                hosts.insert(host);
            }
        }
    }
    let list: Vec<_> = hosts.into_iter().collect();
    println!("cargo:rustc-env=CATFLIX_NATIVE_HOSTS={}", list.join(","));

    // Catflix's own server: the only site the app may open in the system browser (sign-in).
    println!("cargo:rerun-if-env-changed=VITE_BACKEND_URL");
    let backend = env::var("VITE_BACKEND_URL").ok().or_else(|| from_file("VITE_BACKEND_URL")).unwrap_or_default();
    println!("cargo:rustc-env=CATFLIX_BACKEND={}", backend.trim_end_matches('/'));
    tauri_build::build()
}
