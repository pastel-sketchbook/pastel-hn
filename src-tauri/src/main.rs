#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn open_external(url: &str) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command]
const fn get_app_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![open_external, get_app_version])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
