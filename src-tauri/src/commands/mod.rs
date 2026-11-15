use crate::database::DatabaseManager;
use crate::errors::AppHubError;
use crate::models::{
    CollectionRecord, CommandOutputPayload, HistoryRecord, WinGetInstalledApp, WinGetPackage,
    WinGetShowDetails, WinGetSource, WinGetUpgradeInfo,
};
use crate::security::{validate_flag_argument, validate_package_id};
use crate::winget::{
    detect_winget, parse_list_output, parse_search_output, parse_show_output,
    parse_source_list_output, parse_upgrade_output, parse_versions_output, OperationManager,
    WinGetExecutor, WinGetInfo,
};
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

fn resolve_configured_winget_path(
    explicit: Option<String>,
    db: &DatabaseManager,
) -> Option<String> {
    if let Some(p) = explicit {
        if !p.trim().is_empty() {
            return Some(p);
        }
    }
    if let Ok(Some(raw)) = db.get_setting("wingetPath") {
        let parsed = serde_json::from_str::<String>(&raw).unwrap_or(raw);
        if !parsed.trim().is_empty() {
            return Some(parsed);
        }
    }
    None
}

#[tauri::command]
pub async fn check_winget_environment(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<WinGetInfo, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    Ok(detect_winget(resolved.as_deref()))
}

#[tauri::command]
pub async fn winget_search(
    query: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetPackage>, AppHubError> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    if !validate_flag_argument(trimmed) {
        return Err(AppHubError::InvalidPackageId("Illegal query characters".to_string()));
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(&["search", trimmed], resolved.as_deref(), 30).await?;
    if output.success {
        Ok(parse_search_output(&output.stdout))
    } else if output.stdout.to_lowercase().contains("no package found") {
        Ok(Vec::new())
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: if output.stderr.trim().is_empty() {
                output.stdout
            } else {
                output.stderr
            },
        })
    }
}

#[tauri::command]
pub async fn winget_list(
    query: Option<String>,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetInstalledApp>, AppHubError> {
    let mut args = vec!["list"];
    let q_str = query.unwrap_or_default();
    if !q_str.trim().is_empty() {
        if !validate_flag_argument(q_str.trim()) {
            return Err(AppHubError::InvalidPackageId("Illegal query characters".to_string()));
        }
        args.push(q_str.trim());
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 45).await?;
    if output.success || !output.stdout.is_empty() {
        Ok(parse_list_output(&output.stdout))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_upgrade_list(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetUpgradeInfo>, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(&["upgrade"], resolved.as_deref(), 45).await?;
    // winget upgrade can exit non-zero (e.g. 0x8a15002b) when no updates are available
    if output.success || !output.stdout.is_empty() {
        Ok(parse_upgrade_output(&output.stdout))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_show(
    package_id: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<WinGetShowDetails, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(
        &["show", "--id", &package_id, "--exact"],
        resolved.as_deref(),
        30,
    )
    .await?;
    if output.success {
        Ok(parse_show_output(&output.stdout, &package_id))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: if output.stderr.trim().is_empty() {
                output.stdout
            } else {
                output.stderr
            },
        })
    }
}

#[tauri::command]
pub async fn winget_show_versions(
    package_id: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<String>, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(
        &["show", "--id", &package_id, "--exact", "--versions"],
        resolved.as_deref(),
        30,
    )
    .await?;
    if output.success {
        Ok(parse_versions_output(&output.stdout))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_install(
    app: AppHandle,
    package_id: String,
    silent: bool,
    force: bool,
    version: Option<String>,
    custom_location: Option<String>,
    architecture: Option<String>,
    accept_agreements: Option<bool>,
    task_id: Option<String>,
    winget_path: Option<String>,
    ops: State<'_, OperationManager>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["install", "--id", package_id.as_str(), "--exact"];
    if silent {
        args.push("--silent");
    }
    if force {
        args.push("--force");
    }
    if accept_agreements.unwrap_or(true) {
        args.push("--accept-package-agreements");
        args.push("--accept-source-agreements");
    }

    let v_str = version.clone();
    if let Some(ref v) = v_str {
        if !v.trim().is_empty() && validate_flag_argument(v) {
            args.push("--version");
            args.push(v.trim());
        }
    }

    let arch_str = architecture.clone();
    if let Some(ref arch) = arch_str {
        if !arch.trim().is_empty() && arch != "neutral" && validate_flag_argument(arch) {
            args.push("--architecture");
            args.push(arch.trim());
        }
    }

    let loc_str = custom_location.clone();
    if let Some(ref loc) = loc_str {
        if !loc.trim().is_empty() && validate_flag_argument(loc) {
            args.push("--location");
            args.push(loc.trim());
        }
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let tid = task_id.unwrap_or_else(|| format!("install_{}", package_id));
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&package_id),
        &args,
        resolved.as_deref(),
        &ops,
    )
    .await
}

#[tauri::command]
pub async fn winget_uninstall(
    app: AppHandle,
    package_id: String,
    silent: bool,
    task_id: Option<String>,
    winget_path: Option<String>,
    ops: State<'_, OperationManager>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["uninstall", "--id", package_id.as_str(), "--exact"];
    if silent {
        args.push("--silent");
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let tid = task_id.unwrap_or_else(|| format!("uninstall_{}", package_id));
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&package_id),
        &args,
        resolved.as_deref(),
        &ops,
    )
    .await
}

#[tauri::command]
pub async fn winget_upgrade(
    app: AppHandle,
    package_id: String,
    silent: bool,
    accept_agreements: Option<bool>,
    task_id: Option<String>,
    winget_path: Option<String>,
    ops: State<'_, OperationManager>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["upgrade", "--id", package_id.as_str(), "--exact"];
    if accept_agreements.unwrap_or(true) {
        args.push("--accept-package-agreements");
        args.push("--accept-source-agreements");
    }
    if silent {
        args.push("--silent");
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let tid = task_id.unwrap_or_else(|| format!("upgrade_{}", package_id));
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&package_id),
        &args,
        resolved.as_deref(),
        &ops,
    )
    .await
}

#[tauri::command]
pub async fn winget_upgrade_all(
    app: AppHandle,
    silent: bool,
    task_id: Option<String>,
    winget_path: Option<String>,
    ops: State<'_, OperationManager>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    let mut args = vec![
        "upgrade",
        "--all",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ];
    if silent {
        args.push("--silent");
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    let tid = task_id.unwrap_or_else(|| "upgrade_all".to_string());
    WinGetExecutor::execute_streaming(&app, &tid, None, &args, resolved.as_deref(), &ops).await
}

#[tauri::command]
pub async fn cancel_winget_operation(
    task_id: String,
    ops: State<'_, OperationManager>,
) -> Result<bool, AppHubError> {
    Ok(ops.cancel_task(&task_id))
}

#[tauri::command]
pub async fn winget_pin_add(
    package_id: String,
    version: Option<String>,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["pin", "add", "--id", package_id.as_str(), "--exact"];
    let v_str = version.clone();
    if let Some(ref v) = v_str {
        if !v.trim().is_empty() && validate_flag_argument(v) {
            args.push("--version");
            args.push(v.trim());
        }
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 20).await
}

#[tauri::command]
pub async fn winget_pin_remove(
    package_id: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(
        &["pin", "remove", "--id", package_id.as_str(), "--exact"],
        resolved.as_deref(),
        20,
    )
    .await
}

#[tauri::command]
pub async fn winget_source_list(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetSource>, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    let output = WinGetExecutor::execute_readonly(&["source", "list"], resolved.as_deref(), 25).await?;
    if output.success {
        Ok(parse_source_list_output(&output.stdout))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_source_add(
    name: String,
    url: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_flag_argument(&name) || !validate_flag_argument(&url) {
        return Err(AppHubError::InvalidPackageId(
            "Illegal characters in source arguments".to_string(),
        ));
    }
    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(
        &["source", "add", name.trim(), url.trim()],
        resolved.as_deref(),
        45,
    )
    .await
}

#[tauri::command]
pub async fn winget_source_remove(
    name: String,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_flag_argument(&name) {
        return Err(AppHubError::InvalidPackageId(
            "Illegal characters in source name".to_string(),
        ));
    }
    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(
        &["source", "remove", name.trim()],
        resolved.as_deref(),
        30,
    )
    .await
}

#[tauri::command]
pub async fn winget_source_update(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(&["source", "update"], resolved.as_deref(), 60).await
}

#[tauri::command]
pub async fn winget_source_reset(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<CommandOutputPayload, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    WinGetExecutor::execute_readonly(&["source", "reset", "--force"], resolved.as_deref(), 60).await
}

#[tauri::command]
pub async fn send_desktop_notification(
    app: AppHandle,
    title: String,
    body: String,
) -> Result<(), AppHubError> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| AppHubError::NotificationError(e.to_string()))
}

// --- SQLite Database Commands ---

#[tauri::command]
pub async fn db_get_all_settings(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<(String, String)>, AppHubError> {
    db.get_all_settings()
}

#[tauri::command]
pub async fn db_save_setting(
    key: String,
    value: String,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.set_setting(&key, &value)
}

#[tauri::command]
pub async fn db_get_favorites(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<String>, AppHubError> {
    db.get_favorites()
}

#[tauri::command]
pub async fn db_set_favorite(
    package_id: String,
    is_fav: bool,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.set_favorite(&package_id, is_fav)
}

#[tauri::command]
pub async fn db_get_history(
    limit: Option<usize>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<HistoryRecord>, AppHubError> {
    db.get_history(limit.unwrap_or(50))
}

#[tauri::command]
pub async fn db_add_history(
    record: HistoryRecord,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.insert_history(
        &record.id,
        &record.package_id,
        &record.package_name,
        &record.action,
        &record.version,
        &record.status,
        record.error_message.as_deref(),
        record.exit_code,
        record.start_time,
        record.end_time,
    )
}

#[tauri::command]
pub async fn db_clear_history(
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.clear_history()
}

#[tauri::command]
pub async fn db_get_collections(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<CollectionRecord>, AppHubError> {
    db.get_collections()
}

#[tauri::command]
pub async fn db_save_collection(
    collection: CollectionRecord,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.save_collection(&collection)
}

#[tauri::command]
pub async fn db_delete_collection(
    id: String,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.delete_collection(&id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invalid_package_id_validation() {
        let invalid_ids = vec!["", "invalid id with spaces", "malicious; rm -rf /"];
        for id in invalid_ids {
            assert!(!validate_package_id(id));
        }
    }

    #[test]
    fn test_detect_winget_safe_without_binary() {
        let info = detect_winget(Some("nonexistent_winget_binary_xyz"));
        assert!(!info.version.is_empty());
    }
}
