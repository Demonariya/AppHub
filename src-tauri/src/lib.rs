pub mod commands;
pub mod database;
pub mod errors;
pub mod icons;
pub mod models;
pub mod security;
pub mod winget;

use commands::*;
use database::DatabaseManager;
use std::fs;
use std::path::PathBuf;
use winget::OperationManager;

fn get_db_path() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let dir = PathBuf::from(app_data).join("AppHub");
        let _ = fs::create_dir_all(&dir);
        dir.join("apphub.db")
    } else {
        PathBuf::from("apphub.db")
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = get_db_path();
    let db = DatabaseManager::new(&db_path)
        .unwrap_or_else(|_| DatabaseManager::in_memory().expect("in-memory db fallback"));
    let _ = db.mark_interrupted_history_failed();
    let _ = db.mark_interrupted_sync_runs_cancelled();

    let ops = OperationManager::new();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(db)
        .manage(ops)
        .invoke_handler(tauri::generate_handler![
            check_winget_environment,
            winget_sync_catalog,
            cancel_winget_catalog_sync,
            winget_search,
            winget_list,
            winget_upgrade_list,
            winget_show,
            winget_show_versions,
            probe_installer_size,
            winget_install,
            winget_uninstall,
            winget_upgrade,
            winget_upgrade_all,
            cancel_winget_operation,
            winget_pin_add,
            winget_pin_remove,
            winget_source_list,
            winget_source_add,
            winget_source_remove,
            winget_source_update,
            winget_source_reset,
            send_desktop_notification,
            db_get_catalog_packages,
            db_get_catalog_stats,
            db_get_catalog_sources_status,
            db_get_catalog_sync_history,
            db_clear_catalog_cache,
            db_get_all_settings,
            db_save_setting,
            db_get_favorites,
            db_set_favorite,
            db_get_history,
            db_add_history,
            db_clear_history,
            db_get_collections,
            db_save_collection,
            db_delete_collection,
            resolve_and_cache_icon,
            invalidate_icon_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
