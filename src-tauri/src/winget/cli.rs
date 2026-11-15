use crate::errors::AppHubError;
use crate::models::{CommandOutputPayload, WinGetOutputEvent};
use crate::security::validate_flag_argument;
use crate::winget::detector::resolve_winget_binary;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::oneshot;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static PCT_REGEX: OnceLock<Regex> = OnceLock::new();
static BYTE_RATIO_REGEX: OnceLock<Regex> = OnceLock::new();

pub struct OperationManager {
    active_kills: Mutex<HashMap<String, oneshot::Sender<()>>>,
    active_packages: Mutex<HashSet<String>>,
}

impl Default for OperationManager {
    fn default() -> Self {
        Self::new()
    }
}

impl OperationManager {
    pub fn new() -> Self {
        Self {
            active_kills: Mutex::new(HashMap::new()),
            active_packages: Mutex::new(HashSet::new()),
        }
    }

    pub fn try_lock_package(&self, package_id: &str) -> Result<(), AppHubError> {
        let mut pkgs = self.active_packages.lock().unwrap();
        if pkgs.contains(package_id) {
            return Err(AppHubError::DuplicateOperation(package_id.to_string()));
        }
        pkgs.insert(package_id.to_string());
        Ok(())
    }

    pub fn unlock_package(&self, package_id: &str) {
        let mut pkgs = self.active_packages.lock().unwrap();
        pkgs.remove(package_id);
    }

    pub fn register_cancel(&self, task_id: &str, tx: oneshot::Sender<()>) {
        let mut map = self.active_kills.lock().unwrap();
        map.insert(task_id.to_string(), tx);
    }

    pub fn unregister_cancel(&self, task_id: &str) {
        let mut map = self.active_kills.lock().unwrap();
        map.remove(task_id);
    }

    pub fn cancel_task(&self, task_id: &str) -> bool {
        let mut map = self.active_kills.lock().unwrap();
        if let Some(tx) = map.remove(task_id) {
            let _ = tx.send(());
            true
        } else {
            false
        }
    }
}

fn parse_progress_from_line(line: &str) -> (Option<u8>, bool, Option<String>) {
    let pct_re = PCT_REGEX.get_or_init(|| Regex::new(r"(\d{1,3})\s*%").expect("valid pct regex"));
    if let Some(caps) = pct_re.captures(line) {
        if let Ok(pct) = caps[1].parse::<u8>() {
            return (Some(pct.min(100)), false, None);
        }
    }

    let ratio_re = BYTE_RATIO_REGEX.get_or_init(|| {
        Regex::new(r"(\d+(?:\.\d+)?)\s*(KB|MB|GB)\s*/\s*(\d+(?:\.\d+)?)\s*(KB|MB|GB)")
            .expect("valid byte ratio regex")
    });
    if let Some(caps) = ratio_re.captures(line) {
        let cur: f64 = caps[1].parse().unwrap_or(0.0);
        let cur_unit = &caps[2];
        let tot: f64 = caps[3].parse().unwrap_or(0.0);
        let tot_unit = &caps[4];

        let scale = |u: &str| match u {
            "KB" => 1024.0,
            "MB" => 1024.0 * 1024.0,
            "GB" => 1024.0 * 1024.0 * 1024.0,
            _ => 1.0,
        };
        let cur_bytes = cur * scale(cur_unit);
        let tot_bytes = tot * scale(tot_unit);
        if tot_bytes > 0.0 {
            let pct = ((cur_bytes / tot_bytes) * 100.0).clamp(0.0, 100.0) as u8;
            return (Some(pct), false, None);
        }
    }

    (None, true, None)
}

fn detect_phase(line: &str) -> Option<String> {
    let l = line.to_lowercase();
    if l.contains("downloading") {
        Some("downloading".to_string())
    } else if l.contains("verified installer hash") || l.contains("validating") || l.contains("verifying") {
        Some("verifying".to_string())
    } else if l.contains("starting package install") || l.contains("starting package uninstall") || l.contains("installing") {
        Some("installing".to_string())
    } else {
        None
    }
}

fn is_spinner_noise(line: &str) -> bool {
    let t = line.trim();
    t.is_empty() || matches!(t, "-" | "\\" | "|" | "/")
}

async fn pump_stream<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
    mut reader: R,
    app: AppHandle,
    task_id: String,
    stream_name: String,
) -> String {
    let mut collected = String::new();
    let mut buf = [0u8; 2048];
    let mut pending = String::new();

    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                let chunk = String::from_utf8_lossy(&buf[..n]);
                pending.push_str(&chunk);
                collected.push_str(&chunk);

                while let Some(pos) = pending.find(['\n', '\r']) {
                    let line = pending[..pos].to_string();
                    pending.drain(..=pos);
                    let trimmed = line.trim();
                    if is_spinner_noise(trimmed) {
                        continue;
                    }
                    let (progress, is_indeterminate, download_speed) = parse_progress_from_line(trimmed);
                    let phase = detect_phase(trimmed);
                    let _ = app.emit(
                        "winget-output",
                        WinGetOutputEvent {
                            task_id: task_id.clone(),
                            stream: stream_name.clone(),
                            line: trimmed.to_string(),
                            progress,
                            is_indeterminate,
                            download_speed,
                            phase,
                        },
                    );
                }
            }
            Err(_) => break,
        }
    }

    let rem = pending.trim();
    if !is_spinner_noise(rem) {
        let (progress, is_indeterminate, download_speed) = parse_progress_from_line(rem);
        let phase = detect_phase(rem);
        let _ = app.emit(
            "winget-output",
            WinGetOutputEvent {
                task_id,
                stream: stream_name,
                line: rem.to_string(),
                progress,
                is_indeterminate,
                download_speed,
                phase,
            },
        );
    }

    collected
}

pub struct WinGetExecutor;

impl WinGetExecutor {
    fn validate_args(args: &[&str]) -> Result<(), AppHubError> {
        for arg in args {
            if !validate_flag_argument(arg) {
                return Err(AppHubError::InvalidPackageId(format!(
                    "Illegal characters in argument: {}",
                    arg
                )));
            }
        }
        Ok(())
    }

    /// Non-blocking async execution for read-only WinGet queries (search, list, show, upgrade list, source list) with timeout
    pub async fn execute_readonly(
        args: &[&str],
        custom_winget_path: Option<&str>,
        timeout_secs: u64,
    ) -> Result<CommandOutputPayload, AppHubError> {
        Self::validate_args(args)?;
        let bin = resolve_winget_binary(custom_winget_path);

        let mut cmd = Command::new(&bin);
        cmd.args(args)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppHubError::WinGetNotFound
            } else {
                AppHubError::IoError(e)
            }
        })?;

        let output = match tokio::time::timeout(Duration::from_secs(timeout_secs), child.wait_with_output()).await {
            Ok(res) => res.map_err(AppHubError::IoError)?,
            Err(_) => return Err(AppHubError::TimeoutError(timeout_secs)),
        };

        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let success = output.status.success();

        Ok(CommandOutputPayload {
            exit_code,
            stdout,
            stderr,
            success,
            cancelled: false,
        })
    }

    /// Async streaming execution with live Tauri event emission, per-package concurrency lock, and process cancellation
    pub async fn execute_streaming(
        app: &AppHandle,
        task_id: &str,
        package_id: Option<&str>,
        args: &[&str],
        custom_winget_path: Option<&str>,
        manager: &OperationManager,
    ) -> Result<CommandOutputPayload, AppHubError> {
        Self::validate_args(args)?;

        if let Some(pkg_id) = package_id {
            manager.try_lock_package(pkg_id)?;
        }

        let bin = resolve_winget_binary(custom_winget_path);
        let mut cmd = Command::new(&bin);
        cmd.args(args)
            .kill_on_drop(true)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                if let Some(pkg_id) = package_id {
                    manager.unlock_package(pkg_id);
                }
                return Err(if e.kind() == std::io::ErrorKind::NotFound {
                    AppHubError::WinGetNotFound
                } else {
                    AppHubError::IoError(e)
                });
            }
        };

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();

        let stdout_task = stdout_pipe.map(|pipe| {
            tokio::spawn(pump_stream(
                pipe,
                app.clone(),
                task_id.to_string(),
                "stdout".to_string(),
            ))
        });
        let stderr_task = stderr_pipe.map(|pipe| {
            tokio::spawn(pump_stream(
                pipe,
                app.clone(),
                task_id.to_string(),
                "stderr".to_string(),
            ))
        });

        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        manager.register_cancel(task_id, cancel_tx);

        let mut was_cancelled = false;
        let status_res = tokio::select! {
            wait_res = child.wait() => Some(wait_res),
            _ = &mut cancel_rx => {
                was_cancelled = true;
                let _ = child.kill().await;
                let _ = child.wait().await;
                None
            }
        };

        manager.unregister_cancel(task_id);
        if let Some(pkg_id) = package_id {
            manager.unlock_package(pkg_id);
        }

        let stdout = match stdout_task {
            Some(h) => h.await.unwrap_or_default(),
            None => String::new(),
        };
        let stderr = match stderr_task {
            Some(h) => h.await.unwrap_or_default(),
            None => String::new(),
        };

        if was_cancelled {
            let _ = app.emit(
                "winget-output",
                WinGetOutputEvent {
                    task_id: task_id.to_string(),
                    stream: "status".to_string(),
                    line: "Process terminated by user cancellation.".to_string(),
                    progress: None,
                    is_indeterminate: false,
                    download_speed: None,
                    phase: None,
                },
            );
            return Ok(CommandOutputPayload {
                exit_code: -1,
                stdout,
                stderr,
                success: false,
                cancelled: true,
            });
        }

        let status = status_res.unwrap().map_err(AppHubError::IoError)?;
        let exit_code = status.code().unwrap_or(-1);
        let success = status.success();

        Ok(CommandOutputPayload {
            exit_code,
            stdout,
            stderr,
            success,
            cancelled: false,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_progress_parser_percentages_and_ratios() {
        let (pct, ind, _) = parse_progress_from_line("Downloading... 64%");
        assert_eq!(pct, Some(64));
        assert!(!ind);

        let (pct2, ind2, _) = parse_progress_from_line("  22.5 MB / 45.0 MB");
        assert_eq!(pct2, Some(50));
        assert!(!ind2);

        let (pct3, ind3, _) = parse_progress_from_line("Starting package install...");
        assert_eq!(pct3, None);
        assert!(ind3);
    }

    #[test]
    fn test_operation_manager_prevents_duplicate_package_lock() {
        let mgr = OperationManager::new();
        assert!(mgr.try_lock_package("Git.Git").is_ok());
        assert!(mgr.try_lock_package("Git.Git").is_err());
        assert!(mgr.try_lock_package("Mozilla.Firefox").is_ok());
        mgr.unlock_package("Git.Git");
        assert!(mgr.try_lock_package("Git.Git").is_ok());
    }
}
