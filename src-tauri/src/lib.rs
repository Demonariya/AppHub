pub mod commands;
pub mod database;
pub mod errors;
pub mod models;
pub mod security;
pub mod winget;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            check_winget_environment,
            winget_search,
            winget_show,
            winget_install,
            winget_uninstall,
            winget_upgrade_all,
            winget_source_list,
            winget_source_add,
            winget_source_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
