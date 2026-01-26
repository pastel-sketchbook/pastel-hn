#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod client;
mod commands;
mod copilot;
mod types;

use tauri_plugin_window_state::StateFlags;
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

    // Only save/restore position and size, not decorations or fullscreen
    // This ensures the window always starts with decorations visible
    // (zen mode should not persist across app restarts)
    let window_state_flags = StateFlags::POSITION | StateFlags::SIZE | StateFlags::VISIBLE;

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags)
                .build(),
        )
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
            commands::get_cache_stats,
            commands::clear_story_ids_cache,
            // Article extraction
            commands::fetch_article_content,
            // Utility commands
            commands::open_external,
            commands::get_app_version,
            // Copilot AI assistant
            commands::copilot_check,
            commands::copilot_init,
            commands::copilot_summarize,
            commands::copilot_analyze_discussion,
            commands::copilot_explain,
            commands::copilot_draft_reply,
            commands::copilot_ask,
            commands::copilot_shutdown,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
