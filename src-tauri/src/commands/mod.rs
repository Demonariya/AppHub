use crate::database::DatabaseManager;
use crate::errors::AppHubError;
use crate::icons::{build_icon_cache_key, get_icons_cache_dir, resolve_and_cache_icon_impl};
use crate::models::{
    CatalogCacheStats, CatalogSourceStatus, CatalogSyncProgressEvent, CatalogSyncResult,
    CatalogSyncRunRecord, CollectionRecord, CommandOutputPayload, HistoryRecord,
    IconResolveResponse, SourceSyncOutcome, WinGetInstalledApp, WinGetPackage, WinGetShowDetails,
    WinGetSource, WinGetUpgradeInfo,
};
use crate::security::{validate_flag_argument, validate_package_id};
use crate::winget::{
    collect_registry_app_sizes, detect_winget, infer_category_from_metadata,
    inspect_search_result, parse_list_output, parse_search_output, parse_show_output,
    parse_source_list_output, parse_upgrade_output, parse_versions_output,
    probe_installer_download_size, OperationManager, WinGetExecutor, WinGetInfo,
};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::NotificationExt;

static INTERACTIVITY_CAPABILITY_CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();

fn supports_disable_interactivity(resolved_path: Option<&str>) -> bool {
    let key = resolved_path.unwrap_or("default").to_string();
    let cache = INTERACTIVITY_CAPABILITY_CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(&cached) = cache.lock().unwrap().get(&key) {
        return cached;
    }
    let info = detect_winget(resolved_path);
    if info.is_installed {
        cache
            .lock()
            .unwrap()
            .insert(key, info.supports_disable_interactivity);
    }
    info.supports_disable_interactivity
}

struct CatalogSyncLockGuard<'a>(&'a OperationManager);

impl<'a> Drop for CatalogSyncLockGuard<'a> {
    fn drop(&mut self) {
        self.0.unlock_catalog_sync();
    }
}

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

fn emit_catalog_progress(app: &AppHandle, event: CatalogSyncProgressEvent) {
    let _ = app.emit("catalog-sync-progress", event);
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
pub async fn winget_sync_catalog(
    app: AppHandle,
    target_sources: Option<Vec<String>>,
    enabled_sources: Option<Vec<String>>,
    accept_source_agreements: Option<bool>,
    winget_path: Option<String>,
    ops: State<'_, OperationManager>,
    db: State<'_, DatabaseManager>,
) -> Result<CatalogSyncResult, AppHubError> {
    ops.try_lock_catalog_sync()?;
    let _lock_guard = CatalogSyncLockGuard(&ops);

    let sync_started_at = chrono::Utc::now().timestamp_millis();
    let run_id = format!("sync_{}", sync_started_at);
    let resolved = resolve_configured_winget_path(winget_path, &db);
    let accept_agreements = accept_source_agreements.unwrap_or(false);

    // Record run start so crashes/exits during sync are properly recoverable
    let _ = db.save_sync_run(&CatalogSyncRunRecord {
        run_id: run_id.clone(),
        started_at: sync_started_at,
        completed_at: None,
        duration_ms: None,
        status: "running".to_string(),
        total_discovered: 0,
        newly_discovered: 0,
        updated_records: 0,
        unchanged_records: 0,
        unavailable_records: 0,
        is_complete: false,
        is_partial: false,
        cancelled: false,
        error: None,
        outcomes: Vec::new(),
    });

    emit_catalog_progress(
        &app,
        CatalogSyncProgressEvent {
            run_id: run_id.clone(),
            phase: "discovering-sources".to_string(),
            current_source: None,
            sources_completed: 0,
            sources_total: 0,
            packages_discovered: 0,
            message: "Discovering configured WinGet sources...".to_string(),
            is_indeterminate: true,
        },
    );

    let src_list_output = match WinGetExecutor::execute_cancellable_readonly(
        &["source", "list"],
        resolved.as_deref(),
        25,
        &ops,
    )
    .await
    {
        Ok(out) => out,
        Err(e) => {
            let ended_at = chrono::Utc::now().timestamp_millis();
            let err_msg = e.to_string();
            let _ = db.save_sync_run(&CatalogSyncRunRecord {
                run_id: run_id.clone(),
                started_at: sync_started_at,
                completed_at: Some(ended_at),
                duration_ms: Some(ended_at - sync_started_at),
                status: "failed".to_string(),
                total_discovered: 0,
                newly_discovered: 0,
                updated_records: 0,
                unchanged_records: 0,
                unavailable_records: 0,
                is_complete: false,
                is_partial: false,
                cancelled: false,
                error: Some(err_msg.clone()),
                outcomes: Vec::new(),
            });
            emit_catalog_progress(
                &app,
                CatalogSyncProgressEvent {
                    run_id,
                    phase: "failed".to_string(),
                    current_source: None,
                    sources_completed: 0,
                    sources_total: 0,
                    packages_discovered: 0,
                    message: err_msg,
                    is_indeterminate: false,
                },
            );
            return Err(e);
        }
    };

    if src_list_output.cancelled || ops.is_catalog_sync_cancelled() {
        let ended_at = chrono::Utc::now().timestamp_millis();
        let _ = db.save_sync_run(&CatalogSyncRunRecord {
            run_id: run_id.clone(),
            started_at: sync_started_at,
            completed_at: Some(ended_at),
            duration_ms: Some(ended_at - sync_started_at),
            status: "cancelled".to_string(),
            total_discovered: 0,
            newly_discovered: 0,
            updated_records: 0,
            unchanged_records: 0,
            unavailable_records: 0,
            is_complete: false,
            is_partial: false,
            cancelled: true,
            error: Some("Synchronization cancelled by user".to_string()),
            outcomes: Vec::new(),
        });
        emit_catalog_progress(
            &app,
            CatalogSyncProgressEvent {
                run_id: run_id.clone(),
                phase: "cancelled".to_string(),
                current_source: None,
                sources_completed: 0,
                sources_total: 0,
                packages_discovered: 0,
                message: "Catalog synchronization cancelled.".to_string(),
                is_indeterminate: false,
            },
        );
        return Ok(CatalogSyncResult {
            run_id,
            started_at: sync_started_at,
            completed_at: ended_at,
            duration_ms: ended_at - sync_started_at,
            total_discovered: 0,
            newly_discovered: 0,
            updated_records: 0,
            unchanged_records: 0,
            unavailable_records: 0,
            succeeded_sources: Vec::new(),
            failed_sources: Vec::new(),
            source_outcomes: Vec::new(),
            is_complete: false,
            is_partial: false,
            cancelled: true,
            agreement_required: false,
            error: Some("Synchronization cancelled by user".to_string()),
        });
    }

    if !src_list_output.success && src_list_output.stdout.trim().is_empty() {
        let ended_at = chrono::Utc::now().timestamp_millis();
        let err_msg = if src_list_output.stderr.trim().is_empty() {
            format!(
                "Failed to list WinGet sources (exit code {})",
                src_list_output.exit_code
            )
        } else {
            src_list_output.stderr.trim().to_string()
        };
        let _ = db.save_sync_run(&CatalogSyncRunRecord {
            run_id: run_id.clone(),
            started_at: sync_started_at,
            completed_at: Some(ended_at),
            duration_ms: Some(ended_at - sync_started_at),
            status: "failed".to_string(),
            total_discovered: 0,
            newly_discovered: 0,
            updated_records: 0,
            unchanged_records: 0,
            unavailable_records: 0,
            is_complete: false,
            is_partial: false,
            cancelled: false,
            error: Some(err_msg.clone()),
            outcomes: Vec::new(),
        });
        return Err(AppHubError::ExecutionFailed {
            code: Some(src_list_output.exit_code),
            stderr: err_msg,
        });
    }

    let discovered_sources = parse_source_list_output(&src_list_output.stdout);
    let target_set: Option<Vec<String>> =
        target_sources.map(|v| v.into_iter().map(|s| s.to_lowercase()).collect());
    let enabled_set: Option<Vec<String>> = enabled_sources.and_then(|v| {
        if v.is_empty() {
            None
        } else {
            Some(v.into_iter().map(|s| s.to_lowercase()).collect())
        }
    });

    let active_sources: Vec<WinGetSource> = discovered_sources
        .iter()
        .filter(|s| {
            let lower = s.name.to_lowercase();
            let matches_target = target_set
                .as_ref()
                .map(|t| t.contains(&lower))
                .unwrap_or(true);
            let matches_enabled = enabled_set
                .as_ref()
                .map(|e| e.contains(&lower))
                .unwrap_or(true);
            matches_target && matches_enabled
        })
        .cloned()
        .collect();

    // Persist discovered sources list (marking disabled sources cleanly)
    for src in &discovered_sources {
        let lower = src.name.to_lowercase();
        let is_enabled = enabled_set
            .as_ref()
            .map(|e| e.contains(&lower))
            .unwrap_or(true);
        let existing_status = db
            .get_catalog_sources_status()
            .ok()
            .and_then(|list| list.into_iter().find(|s| s.name.eq_ignore_ascii_case(&src.name)));
        let _ = db.save_catalog_source_status(&CatalogSourceStatus {
            name: src.name.clone(),
            argument: src.argument.clone(),
            source_type: src.source_type.clone(),
            is_official: src.is_official,
            is_enabled,
            last_sync_at: existing_status.as_ref().and_then(|s| s.last_sync_at),
            last_status: existing_status
                .as_ref()
                .map(|s| s.last_status.clone())
                .unwrap_or_else(|| if is_enabled { "pending".to_string() } else { "skipped".to_string() }),
            last_error: existing_status.as_ref().and_then(|s| s.last_error.clone()),
            package_count: existing_status.as_ref().map(|s| s.package_count).unwrap_or(0),
            is_complete: existing_status.as_ref().map(|s| s.is_complete).unwrap_or(false),
        });
    }

    let sources_total = active_sources.len();
    let mut outcomes: Vec<SourceSyncOutcome> = Vec::new();
    let mut succeeded_sources: Vec<String> = Vec::new();
    let mut failed_sources: Vec<String> = Vec::new();
    let mut total_discovered = 0usize;
    let mut newly_discovered = 0usize;
    let mut updated_records = 0usize;
    let mut unchanged_records = 0usize;
    let mut unavailable_records = 0usize;
    let mut any_incomplete = false;
    let mut any_cancelled = false;
    let mut any_agreement_required = false;

    for (idx, src) in active_sources.iter().enumerate() {
        if ops.is_catalog_sync_cancelled() {
            any_cancelled = true;
            break;
        }

        let src_start = chrono::Utc::now().timestamp_millis();
        emit_catalog_progress(
            &app,
            CatalogSyncProgressEvent {
                run_id: run_id.clone(),
                phase: "syncing-source".to_string(),
                current_source: Some(src.name.clone()),
                sources_completed: idx,
                sources_total,
                packages_discovered: total_discovered,
                message: format!("Querying source '{}' ({}/{})...", src.name, idx + 1, sources_total),
                is_indeterminate: true,
            },
        );

        let mut args = vec!["search", "--query", "", "--source", src.name.as_str()];
        if accept_agreements {
            args.push("--accept-source-agreements");
        }
        if supports_disable_interactivity(resolved.as_deref()) {
            args.push("--disable-interactivity");
        }
        let cmd_preview = format!("winget {}", args.join(" "));

        match WinGetExecutor::execute_cancellable_readonly(
            &args,
            resolved.as_deref(),
            120,
            &ops,
        )
        .await
        {
            Ok(out) => {
                let src_end = chrono::Utc::now().timestamp_millis();
                if out.cancelled {
                    any_cancelled = true;
                    outcomes.push(SourceSyncOutcome {
                        source_name: src.name.clone(),
                        source_type: src.source_type.clone(),
                        is_official: src.is_official,
                        status: "cancelled".to_string(),
                        command_executed: cmd_preview,
                        exit_code: Some(out.exit_code),
                        discovered_count: 0,
                        inserted_count: 0,
                        updated_count: 0,
                        unchanged_count: 0,
                        unavailable_count: 0,
                        is_complete: false,
                        truncation_reason: None,
                        error: Some("Cancelled by user".to_string()),
                        started_at: src_start,
                        completed_at: src_end,
                        duration_ms: src_end - src_start,
                    });
                    break;
                }

                let insp = inspect_search_result(
                    &out.stdout,
                    &out.stderr,
                    out.exit_code,
                    out.success,
                    &src.name,
                );

                if insp.agreement_required {
                    any_agreement_required = true;
                    any_incomplete = true;
                    failed_sources.push(src.name.clone());
                    let err_msg = insp
                        .error_message
                        .clone()
                        .unwrap_or_else(|| "Source agreements acceptance required".to_string());
                    let _ = db.save_catalog_source_status(&CatalogSourceStatus {
                        name: src.name.clone(),
                        argument: src.argument.clone(),
                        source_type: src.source_type.clone(),
                        is_official: src.is_official,
                        is_enabled: true,
                        last_sync_at: None,
                        last_status: "agreement_required".to_string(),
                        last_error: Some(err_msg.clone()),
                        package_count: 0,
                        is_complete: false,
                    });
                    outcomes.push(SourceSyncOutcome {
                        source_name: src.name.clone(),
                        source_type: src.source_type.clone(),
                        is_official: src.is_official,
                        status: "agreement_required".to_string(),
                        command_executed: cmd_preview,
                        exit_code: Some(out.exit_code),
                        discovered_count: 0,
                        inserted_count: 0,
                        updated_count: 0,
                        unchanged_count: 0,
                        unavailable_count: 0,
                        is_complete: false,
                        truncation_reason: None,
                        error: Some(err_msg),
                        started_at: src_start,
                        completed_at: src_end,
                        duration_ms: src_end - src_start,
                    });
                    continue;
                }

                if let Some(err_msg) = insp.error_message {
                    any_incomplete = true;
                    failed_sources.push(src.name.clone());
                    let _ = db.save_catalog_source_status(&CatalogSourceStatus {
                        name: src.name.clone(),
                        argument: src.argument.clone(),
                        source_type: src.source_type.clone(),
                        is_official: src.is_official,
                        is_enabled: true,
                        last_sync_at: None,
                        last_status: "failed".to_string(),
                        last_error: Some(err_msg.clone()),
                        package_count: 0,
                        is_complete: false,
                    });
                    outcomes.push(SourceSyncOutcome {
                        source_name: src.name.clone(),
                        source_type: src.source_type.clone(),
                        is_official: src.is_official,
                        status: "failed".to_string(),
                        command_executed: cmd_preview,
                        exit_code: Some(out.exit_code),
                        discovered_count: 0,
                        inserted_count: 0,
                        updated_count: 0,
                        unchanged_count: 0,
                        unavailable_count: 0,
                        is_complete: false,
                        truncation_reason: None,
                        error: Some(err_msg),
                        started_at: src_start,
                        completed_at: src_end,
                        duration_ms: src_end - src_start,
                    });
                    continue;
                }

                emit_catalog_progress(
                    &app,
                    CatalogSyncProgressEvent {
                        run_id: run_id.clone(),
                        phase: "reconciling".to_string(),
                        current_source: Some(src.name.clone()),
                        sources_completed: idx,
                        sources_total,
                        packages_discovered: total_discovered + insp.packages.len(),
                        message: format!(
                            "Saving {} packages from '{}' to local SQLite catalog...",
                            insp.packages.len(),
                            src.name
                        ),
                        is_indeterminate: true,
                    },
                );

                let recon = db.reconcile_source_catalog(
                    &src.name,
                    &insp.packages,
                    insp.is_complete,
                    src_end,
                )?;

                let discovered = insp.packages.len();
                total_discovered += discovered;
                newly_discovered += recon.inserted;
                updated_records += recon.updated;
                unchanged_records += recon.unchanged;
                unavailable_records += recon.marked_unavailable;

                if !insp.is_complete {
                    any_incomplete = true;
                }
                succeeded_sources.push(src.name.clone());

                let src_status = if insp.is_complete {
                    "completed".to_string()
                } else {
                    "partial".to_string()
                };

                let _ = db.save_catalog_source_status(&CatalogSourceStatus {
                    name: src.name.clone(),
                    argument: src.argument.clone(),
                    source_type: src.source_type.clone(),
                    is_official: src.is_official,
                    is_enabled: true,
                    last_sync_at: Some(src_end),
                    last_status: src_status.clone(),
                    last_error: insp.truncation_reason.clone(),
                    package_count: discovered,
                    is_complete: insp.is_complete,
                });

                outcomes.push(SourceSyncOutcome {
                    source_name: src.name.clone(),
                    source_type: src.source_type.clone(),
                    is_official: src.is_official,
                    status: src_status,
                    command_executed: cmd_preview,
                    exit_code: Some(out.exit_code),
                    discovered_count: discovered,
                    inserted_count: recon.inserted,
                    updated_count: recon.updated,
                    unchanged_count: recon.unchanged,
                    unavailable_count: recon.marked_unavailable,
                    is_complete: insp.is_complete,
                    truncation_reason: insp.truncation_reason,
                    error: None,
                    started_at: src_start,
                    completed_at: src_end,
                    duration_ms: src_end - src_start,
                });
            }
            Err(e) => {
                let src_end = chrono::Utc::now().timestamp_millis();
                any_incomplete = true;
                failed_sources.push(src.name.clone());
                let err_msg = e.to_string();
                let _ = db.save_catalog_source_status(&CatalogSourceStatus {
                    name: src.name.clone(),
                    argument: src.argument.clone(),
                    source_type: src.source_type.clone(),
                    is_official: src.is_official,
                    is_enabled: true,
                    last_sync_at: None,
                    last_status: "failed".to_string(),
                    last_error: Some(err_msg.clone()),
                    package_count: 0,
                    is_complete: false,
                });
                outcomes.push(SourceSyncOutcome {
                    source_name: src.name.clone(),
                    source_type: src.source_type.clone(),
                    is_official: src.is_official,
                    status: "failed".to_string(),
                    command_executed: cmd_preview,
                    exit_code: None,
                    discovered_count: 0,
                    inserted_count: 0,
                    updated_count: 0,
                    unchanged_count: 0,
                    unavailable_count: 0,
                    is_complete: false,
                    truncation_reason: None,
                    error: Some(err_msg),
                    started_at: src_start,
                    completed_at: src_end,
                    duration_ms: src_end - src_start,
                });
            }
        }
    }

    let completed_at = chrono::Utc::now().timestamp_millis();
    let duration_ms = completed_at - sync_started_at;
    let is_complete = !any_cancelled && !any_incomplete && failed_sources.is_empty();
    let is_partial = !succeeded_sources.is_empty() && (any_incomplete || !failed_sources.is_empty() || any_cancelled);

    let overall_error = if any_agreement_required {
        Some("One or more WinGet sources require accepting source agreements.".to_string())
    } else if !failed_sources.is_empty() {
        Some(format!(
            "Failed to synchronize source(s): {}",
            failed_sources.join(", ")
        ))
    } else if any_cancelled {
        Some("Synchronization cancelled by user".to_string())
    } else {
        None
    };

    let run_status = if any_cancelled {
        "cancelled".to_string()
    } else if succeeded_sources.is_empty() && !failed_sources.is_empty() {
        "failed".to_string()
    } else if is_partial {
        "partial".to_string()
    } else {
        "completed".to_string()
    };

    let _ = db.save_sync_run(&CatalogSyncRunRecord {
        run_id: run_id.clone(),
        started_at: sync_started_at,
        completed_at: Some(completed_at),
        duration_ms: Some(duration_ms),
        status: run_status.clone(),
        total_discovered,
        newly_discovered,
        updated_records,
        unchanged_records,
        unavailable_records,
        is_complete,
        is_partial,
        cancelled: any_cancelled,
        error: overall_error.clone(),
        outcomes: outcomes.clone(),
    });

    emit_catalog_progress(
        &app,
        CatalogSyncProgressEvent {
            run_id: run_id.clone(),
            phase: if any_cancelled {
                "cancelled".to_string()
            } else if run_status == "failed" {
                "failed".to_string()
            } else {
                "completed".to_string()
            },
            current_source: None,
            sources_completed: sources_total,
            sources_total,
            packages_discovered: total_discovered,
            message: format!(
                "Synchronized {} packages across {} source(s).",
                total_discovered,
                succeeded_sources.len()
            ),
            is_indeterminate: false,
        },
    );

    Ok(CatalogSyncResult {
        run_id,
        started_at: sync_started_at,
        completed_at,
        duration_ms,
        total_discovered,
        newly_discovered,
        updated_records,
        unchanged_records,
        unavailable_records,
        succeeded_sources,
        failed_sources,
        source_outcomes: outcomes,
        is_complete,
        is_partial,
        cancelled: any_cancelled,
        agreement_required: any_agreement_required,
        error: overall_error,
    })
}

#[tauri::command]
pub async fn cancel_winget_catalog_sync(
    ops: State<'_, OperationManager>,
) -> Result<bool, AppHubError> {
    Ok(ops.cancel_catalog_sync())
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
    let mut args = vec!["search", trimmed];
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let output = WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 30).await?;
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
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let (output_res, size_index) = tokio::join!(
        WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 45),
        collect_registry_app_sizes(),
    );
    let output = output_res?;
    if output.success || !output.stdout.is_empty() {
        let mut apps = parse_list_output(&output.stdout);
        for app in &mut apps {
            app.installed_size_bytes = size_index.lookup_installed_size(&app.id, &app.name);
        }
        Ok(apps)
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn probe_installer_size(url: String) -> Result<Option<u64>, AppHubError> {
    Ok(probe_installer_download_size(&url).await)
}

#[tauri::command]
pub async fn winget_upgrade_list(
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetUpgradeInfo>, AppHubError> {
    let resolved = resolve_configured_winget_path(winget_path, &db);
    let mut args = vec!["upgrade"];
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let output = WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 45).await?;
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
    source: Option<String>,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<WinGetShowDetails, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["show", "--id", package_id.as_str(), "--exact"];
    let src_clean = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "external" && *s != "custom" && validate_flag_argument(s));
    if let Some(src) = src_clean {
        args.push("--source");
        args.push(src);
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let output = WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 30).await?;
    if output.success {
        let details = parse_show_output(&output.stdout, &package_id);
        let inferred_cat =
            infer_category_from_metadata(&details.tags, details.description.as_deref());
        let _ = db.update_package_metadata_from_show(
            &package_id,
            src_clean,
            &details,
            inferred_cat.as_deref(),
        );
        Ok(details)
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
    source: Option<String>,
    winget_path: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<String>, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["show", "--id", package_id.as_str(), "--exact", "--versions"];
    let src_clean = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "external" && *s != "custom" && validate_flag_argument(s));
    if let Some(src) = src_clean {
        args.push("--source");
        args.push(src);
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let output = WinGetExecutor::execute_readonly(&args, resolved.as_deref(), 30).await?;
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
    source: Option<String>,
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
    let src_clean = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "external" && *s != "custom" && validate_flag_argument(s));
    if let Some(src) = src_clean {
        args.push("--source");
        args.push(src);
    }
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
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let tid = task_id.unwrap_or_else(|| format!("install_{}", package_id));
    let lock_key = OperationManager::build_lock_key(&package_id, src_clean);
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&lock_key),
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
    source: Option<String>,
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
    let src_clean = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "external" && *s != "custom" && validate_flag_argument(s));
    if let Some(src) = src_clean {
        args.push("--source");
        args.push(src);
    }
    if silent {
        args.push("--silent");
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let tid = task_id.unwrap_or_else(|| format!("uninstall_{}", package_id));
    let lock_key = OperationManager::build_lock_key(&package_id, src_clean);
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&lock_key),
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
    source: Option<String>,
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
    let src_clean = source
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "external" && *s != "custom" && validate_flag_argument(s));
    if let Some(src) = src_clean {
        args.push("--source");
        args.push(src);
    }
    if accept_agreements.unwrap_or(true) {
        args.push("--accept-package-agreements");
        args.push("--accept-source-agreements");
    }
    if silent {
        args.push("--silent");
    }

    let resolved = resolve_configured_winget_path(winget_path, &db);
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let tid = task_id.unwrap_or_else(|| format!("upgrade_{}", package_id));
    let lock_key = OperationManager::build_lock_key(&package_id, src_clean);
    WinGetExecutor::execute_streaming(
        &app,
        &tid,
        Some(&lock_key),
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
    if supports_disable_interactivity(resolved.as_deref()) {
        args.push("--disable-interactivity");
    }
    let tid = task_id.unwrap_or_else(|| "upgrade_all".to_string());
    WinGetExecutor::execute_streaming(&app, &tid, None, &args, resolved.as_deref(), &ops).await
}

#[tauri::command]
pub async fn cancel_winget_operation(
    task_id: String,
    ops: State<'_, OperationManager>,
) -> Result<bool, AppHubError> {
    Ok(ops.cancel_task(&task_id).await)
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

// --- SQLite Catalog & App Database Commands ---

#[tauri::command]
pub async fn db_get_catalog_packages(
    include_unavailable: Option<bool>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<WinGetPackage>, AppHubError> {
    db.get_catalog_packages(include_unavailable.unwrap_or(false))
}

#[tauri::command]
pub async fn db_get_catalog_stats(
    db: State<'_, DatabaseManager>,
) -> Result<CatalogCacheStats, AppHubError> {
    db.get_catalog_stats()
}

#[tauri::command]
pub async fn db_get_catalog_sources_status(
    db: State<'_, DatabaseManager>,
) -> Result<Vec<CatalogSourceStatus>, AppHubError> {
    db.get_catalog_sources_status()
}

#[tauri::command]
pub async fn db_get_catalog_sync_history(
    limit: Option<usize>,
    db: State<'_, DatabaseManager>,
) -> Result<Vec<CatalogSyncRunRecord>, AppHubError> {
    db.get_sync_history(limit.unwrap_or(20))
}

#[tauri::command]
pub async fn db_clear_catalog_cache(
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.clear_catalog_cache()
}

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
    source: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<(), AppHubError> {
    db.set_favorite_with_source(&package_id, source.as_deref(), is_fav)
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
        record.queued_at,
        record.started_at,
        record.ended_at,
        record.source.as_deref(),
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

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn resolve_and_cache_icon(
    package_id: String,
    source: Option<String>,
    source_type: String,
    candidate_urls: Vec<String>,
    force_refresh: Option<bool>,
    homepage: Option<String>,
    publisher_url: Option<String>,
    package_name: Option<String>,
    is_external: Option<bool>,
    db: State<'_, DatabaseManager>,
) -> Result<IconResolveResponse, AppHubError> {
    let cache_dir = get_icons_cache_dir();
    resolve_and_cache_icon_impl(
        &db,
        &cache_dir,
        &package_id,
        source.as_deref(),
        &source_type,
        &candidate_urls,
        force_refresh.unwrap_or(false),
        homepage.as_deref(),
        publisher_url.as_deref(),
        package_name.as_deref(),
        is_external,
    )
    .await
}

#[tauri::command]
pub async fn invalidate_icon_cache(
    package_id: Option<String>,
    source: Option<String>,
    db: State<'_, DatabaseManager>,
) -> Result<usize, AppHubError> {
    if let Some(pid) = package_id {
        let key = build_icon_cache_key(&pid, source.as_deref());
        db.invalidate_cached_icon(&key)
    } else {
        db.clear_icon_cache()?;
        Ok(0)
    }
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
