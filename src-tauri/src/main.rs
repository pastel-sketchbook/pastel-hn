//! # pastel-hn
//!
//! A cross-platform Hacker News desktop client with a Cyberpunk Pastel aesthetic.
//!
//! This is the Tauri backend that provides:
//!
//! - **HN API Client** ([`client`]) - Fetches stories, comments, and users from the
//!   HN Firebase API and Algolia search, with intelligent caching via moka.
//!
//! - **Tauri Commands** ([`commands`]) - IPC handlers that expose the API to the
//!   TypeScript frontend.
//!
//! - **AI Assistant** ([`copilot`]) - Optional GitHub Copilot integration for
//!   summarizing articles, analyzing discussions, and drafting replies.
//!
//! - **Text-to-Speech** ([`tts`]) - Native OS speech synthesis for reading
//!   articles aloud (free, works offline).
//!
//! - **Type Definitions** ([`types`]) - Shared types for API responses, errors,
//!   and configuration.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────┐
//! │  TypeScript (UI Layer)                      │
//! │  - Vite + vanilla TypeScript                │
//! │  - Virtual scrolling for performance        │
//! │  - CSS with Cyberpunk Pastel design system  │
//! └─────────────────┬───────────────────────────┘
//!                   │ Tauri IPC (invoke)
//! ┌─────────────────▼───────────────────────────┐
//! │  Rust (Data Layer) - This crate             │
//! │  - Tauri 2.x for native desktop shell       │
//! │  - reqwest for HTTP with connection pooling │
//! │  - moka for in-memory caching               │
//! │  - tokio for async concurrent fetching      │
//! │  - tracing for structured logging           │
//! └─────────────────────────────────────────────┘
//! ```
//!
//! ## Caching Strategy
//!
//! | Cache | TTL | Max Size | Notes |
//! |-------|-----|----------|-------|
//! | Items (stories/comments) | 5 min | 10,000 | Stale-while-revalidate |
//! | Story IDs per feed | 2 min | 10 | Background refresh at 75% TTL |
//! | User profiles | 10 min | 100 | - |

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod client;
mod commands;
mod copilot;
mod tts;
mod types;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }

                    let show_window =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyH);
                    let refresh =
                        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR);

                    if shortcut == &show_window {
                        info!("Global shortcut: Show window");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    } else if shortcut == &refresh {
                        info!("Global shortcut: Refresh");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("tray-refresh", ());
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(),
        )
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

            // Register global shortcuts
            let show_window = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyH);
            let refresh = Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyR);

            if let Err(e) = app.global_shortcut().register(show_window) {
                info!("Failed to register Cmd+Shift+H shortcut: {}", e);
            } else {
                info!("Registered global shortcut: Cmd+Shift+H (show window)");
            }

            if let Err(e) = app.global_shortcut().register(refresh) {
                info!("Failed to register Cmd+Shift+R shortcut: {}", e);
            } else {
                info!("Registered global shortcut: Cmd+Shift+R (refresh)");
            }

            // Register deep link schemes for development (on Linux/Windows)
            // On macOS, deep links only work with the bundled app in /Applications
            #[cfg(any(target_os = "linux", target_os = "windows"))]
            {
                if let Err(e) = app.deep_link().register_all() {
                    info!("Failed to register deep link schemes: {}", e);
                } else {
                    info!("Registered deep link scheme: pastelhn://");
                }
            }

            // Set up deep link handler
            app.deep_link().on_open_url(|event| {
                let urls = event.urls();
                for url in urls {
                    info!("Deep link received: {}", url);
                }
            });

            // Check if app was opened via deep link
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for url in urls {
                    info!("App opened via deep link: {}", url);
                    // Emit event to frontend to handle the URL
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("deep-link", url.to_string());
                    }
                }
            }

            info!("Deep link handler initialized");

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
            commands::is_feed_stale,
            commands::background_refresh_feed,
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
            // TTS (Text-to-Speech)
            commands::tts_init,
            commands::tts_status,
            commands::tts_speak,
            commands::tts_stop,
            commands::tts_get_voices,
            commands::tts_set_voice,
            commands::tts_set_rate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
