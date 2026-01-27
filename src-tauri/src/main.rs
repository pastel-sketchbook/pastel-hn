#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod client;
mod commands;
mod copilot;
mod types;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(window_state_flags)
                .build(),
        )
        .manage(hn_client)
        .setup(|app| {
            // Create tray menu items for feeds
            let top_i = MenuItem::with_id(app, "feed_top", "Top Stories", true, None::<&str>)?;
            let new_i = MenuItem::with_id(app, "feed_new", "New Stories", true, None::<&str>)?;
            let best_i = MenuItem::with_id(app, "feed_best", "Best Stories", true, None::<&str>)?;
            let ask_i = MenuItem::with_id(app, "feed_ask", "Ask HN", true, None::<&str>)?;
            let show_i = MenuItem::with_id(app, "feed_show", "Show HN", true, None::<&str>)?;
            let jobs_i = MenuItem::with_id(app, "feed_jobs", "Jobs", true, None::<&str>)?;
            let saved_i = MenuItem::with_id(app, "feed_saved", "Saved", true, None::<&str>)?;

            // Create submenu for feeds
            let feeds_menu = Submenu::with_items(
                app,
                "Feeds",
                true,
                &[&top_i, &new_i, &best_i, &ask_i, &show_i, &jobs_i, &saved_i],
            )?;

            // Create other menu items
            let refresh_i = MenuItem::with_id(app, "refresh", "Refresh", true, None::<&str>)?;
            let search_i = MenuItem::with_id(app, "search", "Search...", true, None::<&str>)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let show_window_i =
                MenuItem::with_id(app, "show_window", "Show Window", true, None::<&str>)?;
            let sep2 = PredefinedMenuItem::separator(app)?;
            let sep3 = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit pastel-hn", true, None::<&str>)?;

            // Build the tray menu
            let tray_menu = Menu::with_items(
                app,
                &[
                    &feeds_menu,
                    &sep1,
                    &refresh_i,
                    &search_i,
                    &sep2,
                    &show_window_i,
                    &sep3,
                    &quit_i,
                ],
            )?;

            // Build the tray icon - use include_bytes for reliable icon loading on macOS
            let icon_bytes = include_bytes!("../icons/32x32.png");
            let tray_icon = Image::from_bytes(icon_bytes)
                .unwrap_or_else(|_| app.default_window_icon().unwrap().clone());
            let _tray = TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("pastel-hn")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    let id = event.id.as_ref();
                    info!("Tray menu event: {}", id);

                    match id {
                        "quit" => {
                            info!("Quit requested from tray");
                            app.exit(0);
                        }
                        "show_window" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        id if id.starts_with("feed_") => {
                            let feed = id.strip_prefix("feed_").unwrap_or("top");
                            info!("Feed selected from tray: {}", feed);
                            // Emit event to frontend to switch feed
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-feed-change", feed);
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "refresh" => {
                            info!("Refresh requested from tray");
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-refresh", ());
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "search" => {
                            info!("Search requested from tray");
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("tray-search", ());
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {
                            info!("Unknown tray menu item: {}", id);
                        }
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Left click shows the window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            info!("System tray initialized");
            Ok(())
        })
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
