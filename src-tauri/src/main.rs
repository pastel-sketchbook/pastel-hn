#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod client;
mod commands;
mod types;

use tracing::info;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(fmt::layer())
        .with(EnvFilter::from_default_env().add_directive("pastel_hn=debug".parse().unwrap()))
        .init();

    info!("Starting pastel-hn v{}", env!("CARGO_PKG_VERSION"));

    // Create the HN client
    let hn_client = client::create_client();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(hn_client)
        .invoke_handler(tauri::generate_handler![
            // HN API commands
            commands::fetch_stories,
            commands::fetch_item,
            commands::fetch_items,
            commands::fetch_story_with_comments,
            commands::fetch_comment_children,
            commands::fetch_user,
            commands::fetch_user_submissions,
            commands::search_hn,
            commands::clear_cache,
            commands::clear_story_ids_cache,
            // Utility commands
            commands::open_external,
            commands::get_app_version,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
