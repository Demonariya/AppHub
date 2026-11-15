use crate::errors::AppHubError;
use crate::models::{CommandOutputPayload, OperationPhase, OperationStatus, WinGetOutputEvent};
use crate::security::validate_flag_argument;
use crate::winget::detector::resolve_winget_binary;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncReadExt;
use tokio::process::Command;
use tokio::sync::{oneshot, watch};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

static PCT_REGEX: OnceLock<Regex> = OnceLock::new();
static BYTE_RATIO_REGEX: OnceLock<Regex> = OnceLock::new();
static SPEED_REGEX: OnceLock<Regex> = OnceLock::new();

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedProgress {
    pub progress_percent: Option<f64>,
    pub is_indeterminate: bool,
    pub bytes_downloaded: Option<u64>,
    pub total_bytes: Option<u64>,
    pub download_speed: Option<String>,
}

pub struct OperationManager {
    active_kills: Mutex<HashMap<String, oneshot::Sender<()>>>,
    active_completions: Mutex<HashMap<String, watch::Receiver<bool>>>,
    active_packages: Mutex<HashSet<String>>,
    catalog_sync_active: AtomicBool,
    catalog_sync_cancelled: AtomicBool,
    catalog_sync_kill: Mutex<Option<oneshot::Sender<()>>>,
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
            active_completions: Mutex::new(HashMap::new()),
            active_packages: Mutex::new(HashSet::new()),
            catalog_sync_active: AtomicBool::new(false),
            catalog_sync_cancelled: AtomicBool::new(false),
            catalog_sync_kill: Mutex::new(None),
        }
    }

    pub fn try_lock_catalog_sync(&self) -> Result<(), AppHubError> {
        if self
            .catalog_sync_active
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(AppHubError::DuplicateOperation(
                "catalog-sync".to_string(),
            ));
        }
        self.catalog_sync_cancelled.store(false, Ordering::SeqCst);
        Ok(())
    }

    pub fn unlock_catalog_sync(&self) {
        let mut kill_slot = self.catalog_sync_kill.lock().unwrap();
        *kill_slot = None;
        self.catalog_sync_active.store(false, Ordering::SeqCst);
    }

    pub fn is_catalog_sync_cancelled(&self) -> bool {
        self.catalog_sync_cancelled.load(Ordering::SeqCst)
    }

    pub fn register_catalog_cancel(&self, tx: oneshot::Sender<()>) {
        let mut kill_slot = self.catalog_sync_kill.lock().unwrap();
        *kill_slot = Some(tx);
    }

    pub fn unregister_catalog_cancel(&self) {
        let mut kill_slot = self.catalog_sync_kill.lock().unwrap();
        *kill_slot = None;
    }

    pub fn cancel_catalog_sync(&self) -> bool {
        if !self.catalog_sync_active.load(Ordering::SeqCst) {
            return false;
        }
        self.catalog_sync_cancelled.store(true, Ordering::SeqCst);
        let mut kill_slot = self.catalog_sync_kill.lock().unwrap();
        if let Some(tx) = kill_slot.take() {
            let _ = tx.send(());
        }
        true
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

    pub fn register_cancel(
        &self,
        task_id: &str,
        tx: oneshot::Sender<()>,
        done_rx: watch::Receiver<bool>,
    ) {
        self.active_kills
            .lock()
            .unwrap()
            .insert(task_id.to_string(), tx);
        self.active_completions
            .lock()
            .unwrap()
            .insert(task_id.to_string(), done_rx);
    }

    pub fn unregister_cancel(&self, task_id: &str) {
        self.active_kills.lock().unwrap().remove(task_id);
        self.active_completions.lock().unwrap().remove(task_id);
    }

    /// Signals termination and awaits confirmed child exit (up to 5s) before returning.
    pub async fn cancel_task(&self, task_id: &str) -> bool {
        let tx_opt = self.active_kills.lock().unwrap().remove(task_id);
        let rx_opt = self.active_completions.lock().unwrap().get(task_id).cloned();

        let Some(tx) = tx_opt else {
            return false;
        };

        let _ = tx.send(());

        if let Some(mut rx) = rx_opt {
            if !*rx.borrow() {
                let _ = tokio::time::timeout(
                    Duration::from_secs(5),
                    rx.wait_for(|done| *done),
                )
                .await;
            }
        }

        self.active_completions.lock().unwrap().remove(task_id);
        true
    }
}

fn unit_scale(unit: &str) -> f64 {
    match unit.to_ascii_lowercase().as_str() {
        "b" => 1.0,
        "kb" => 1_000.0,
        "kib" => 1_024.0,
        "mb" => 1_000.0 * 1_000.0,
        "mib" => 1_024.0 * 1_024.0,
        "gb" => 1_000.0 * 1_000.0 * 1_000.0,
        "gib" => 1_024.0 * 1_024.0 * 1_024.0,
        _ => 1.0,
    }
}

/// Strictly parses progress metrics from WinGet terminal output without fabricating percentages or speeds.
pub fn parse_progress_from_line(line: &str) -> ParsedProgress {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return ParsedProgress {
            progress_percent: None,
            is_indeterminate: true,
            bytes_downloaded: None,
            total_bytes: None,
            download_speed: None,
        };
    }

    let speed_re = SPEED_REGEX.get_or_init(|| {
        Regex::new(r"(?i)\b(\d+(?:\.\d+)?\s*(?:B|KB|KiB|MB|MiB|GB|GiB)/s)\b")
            .expect("valid speed regex")
    });
    let download_speed = speed_re
        .captures(trimmed)
        .map(|c| c[1].trim().to_string());

    let ratio_re = BYTE_RATIO_REGEX.get_or_init(|| {
        Regex::new(r"(?i)\b(\d+(?:\.\d+)?)\s*(B|KB|KiB|MB|MiB|GB|GiB)\s*/\s*(\d+(?:\.\d+)?)\s*(B|KB|KiB|MB|MiB|GB|GiB)\b")
            .expect("valid byte ratio regex")
    });

    let mut bytes_downloaded: Option<u64> = None;
    let mut total_bytes: Option<u64> = None;
    let mut ratio_pct: Option<f64> = None;

    if let Some(caps) = ratio_re.captures(trimmed) {
        let cur: f64 = caps[1].parse().unwrap_or(0.0);
        let cur_unit = &caps[2];
        let tot: f64 = caps[3].parse().unwrap_or(0.0);
        let tot_unit = &caps[4];

        let cur_b = (cur * unit_scale(cur_unit)).round();
        let tot_b = (tot * unit_scale(tot_unit)).round();
        if tot_b > 0.0 && cur_b >= 0.0 && cur_b <= tot_b * 1.05 {
            bytes_downloaded = Some(cur_b as u64);
            total_bytes = Some(tot_b as u64);
            ratio_pct = Some(((cur_b / tot_b) * 100.0).clamp(0.0, 100.0));
        }
    }

    // Only accept percentage matches that represent genuine progress indicators (not prose like "100% compatible")
    let pct_re = PCT_REGEX.get_or_init(|| {
        Regex::new(r"(?:^|[\s█▓▒░=\-])(\d{1,3}(?:\.\d+)?)\s*%(?:$|[\s/(\[])")
            .expect("valid pct regex")
    });

    let lower = trimmed.to_ascii_lowercase();
    let has_progress_context = trimmed.contains('█')
        || trimmed.contains('▒')
        || trimmed.contains('▓')
        || trimmed.contains('░')
        || bytes_downloaded.is_some()
        || download_speed.is_some()
        || lower.contains("download")
        || lower.contains("progress")
        || lower.contains("extract")
        || lower.contains("verify")
        || lower.contains("install")
        || trimmed.ends_with('%');

    let explicit_pct = if has_progress_context {
        pct_re.captures(trimmed).and_then(|caps| {
            caps[1]
                .parse::<f64>()
                .ok()
                .filter(|v| *v >= 0.0 && *v <= 100.0)
        })
    } else {
        None
    };

    let progress_percent = explicit_pct.or(ratio_pct);
    let is_indeterminate = progress_percent.is_none();

    ParsedProgress {
        progress_percent,
        is_indeterminate,
        bytes_downloaded,
        total_bytes,
        download_speed,
    }
}

pub fn detect_phase(line: &str) -> Option<OperationPhase> {
    let l = line.to_lowercase();
    if l.contains("downloading") || BYTE_RATIO_REGEX.get().is_some_and(|r| r.is_match(line)) {
        Some(OperationPhase::Downloading)
    } else if l.contains("verified installer hash")
        || l.contains("successfully verified installer hash")
        || l.contains("validating")
        || l.contains("verifying")
    {
        Some(OperationPhase::Verifying)
    } else if l.contains("starting package install")
        || l.contains("starting package uninstall")
        || l.contains("starting package upgrade")
        || l.contains("installing")
        || l.contains("uninstalling")
    {
        Some(OperationPhase::Installing)
    } else {
        None
    }
}

fn is_spinner_noise(line: &str) -> bool {
    let t = line.trim();
    t.is_empty() || matches!(t, "-" | "\\" | "|" | "/")
}

/// Decodes raw chunked byte streams into complete CR/LF lines without breaking multi-byte UTF-8 boundaries.
#[derive(Default)]
pub struct ByteLineAccumulator {
    pending: Vec<u8>,
}

impl ByteLineAccumulator {
    pub fn push_bytes(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut lines = Vec::new();
        let mut start = 0usize;

        for (i, &b) in self.pending.iter().enumerate() {
            if b == b'\n' || b == b'\r' {
                if i > start {
                    let s = String::from_utf8_lossy(&self.pending[start..i]).to_string();
                    lines.push(s);
                }
                start = i + 1;
            }
        }

        if start > 0 {
            self.pending.drain(..start);
        }

        lines
    }

    pub fn flush_remaining(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            None
        } else {
            let s = String::from_utf8_lossy(&self.pending).to_string();
            self.pending.clear();
            Some(s)
        }
    }
}

fn emit_stream_line(
    app: &AppHandle,
    task_id: &str,
    stream_name: &str,
    seq: &Arc<AtomicU64>,
    raw_line: &str,
) {
    let trimmed = raw_line.trim();
    if is_spinner_noise(trimmed) {
        return;
    }
    let parsed = parse_progress_from_line(trimmed);
    let phase = detect_phase(trimmed);
    let event_sequence = seq.fetch_add(1, Ordering::SeqCst) + 1;
    let progress_u8 = parsed
        .progress_percent
        .map(|p| p.round().clamp(0.0, 100.0) as u8);

    let _ = app.emit(
        "winget-output",
        WinGetOutputEvent {
            task_id: task_id.to_string(),
            event_sequence,
            stream: stream_name.to_string(),
            line: trimmed.to_string(),
            progress: progress_u8,
            progress_percent: parsed.progress_percent,
            is_indeterminate: parsed.is_indeterminate,
            bytes_downloaded: parsed.bytes_downloaded,
            total_bytes: parsed.total_bytes,
            download_speed: parsed.download_speed,
            phase,
            status: OperationStatus::Running,
            message: Some(trimmed.to_string()),
            timestamp: chrono::Utc::now().timestamp_millis(),
        },
    );
}

async fn pump_stream<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
    mut reader: R,
    app: AppHandle,
    task_id: String,
    stream_name: String,
    seq: Arc<AtomicU64>,
) -> String {
    let mut collected_bytes = Vec::new();
    let mut accumulator = ByteLineAccumulator::default();
    let mut buf = [0u8; 2048];

    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                collected_bytes.extend_from_slice(&buf[..n]);
                for line in accumulator.push_bytes(&buf[..n]) {
                    emit_stream_line(&app, &task_id, &stream_name, &seq, &line);
                }
            }
            Err(_) => break,
        }
    }

    if let Some(rem) = accumulator.flush_remaining() {
        emit_stream_line(&app, &task_id, &stream_name, &seq, &rem);
    }

    String::from_utf8_lossy(&collected_bytes).to_string()
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

        let output =
            match tokio::time::timeout(Duration::from_secs(timeout_secs), child.wait_with_output())
                .await
            {
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

    /// Cancellable async read-only WinGet query used during background catalog synchronization.
    pub async fn execute_cancellable_readonly(
        args: &[&str],
        custom_winget_path: Option<&str>,
        timeout_secs: u64,
        manager: &OperationManager,
    ) -> Result<CommandOutputPayload, AppHubError> {
        Self::validate_args(args)?;
        if manager.is_catalog_sync_cancelled() {
            return Ok(CommandOutputPayload {
                exit_code: -1,
                stdout: String::new(),
                stderr: String::new(),
                success: false,
                cancelled: true,
            });
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

        let mut child = cmd.spawn().map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppHubError::WinGetNotFound
            } else {
                AppHubError::IoError(e)
            }
        })?;

        let mut stdout_pipe = child.stdout.take();
        let mut stderr_pipe = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            if let Some(ref mut pipe) = stdout_pipe {
                let _ = pipe.read_to_end(&mut buf).await;
            }
            String::from_utf8_lossy(&buf).to_string()
        });
        let stderr_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            if let Some(ref mut pipe) = stderr_pipe {
                let _ = pipe.read_to_end(&mut buf).await;
            }
            String::from_utf8_lossy(&buf).to_string()
        });

        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        manager.register_catalog_cancel(cancel_tx);

        enum WaitOutcome {
            Done(std::io::Result<std::process::ExitStatus>),
            Cancelled,
            TimedOut,
        }

        let outcome = tokio::select! {
            res = child.wait() => WaitOutcome::Done(res),
            _ = &mut cancel_rx => WaitOutcome::Cancelled,
            _ = tokio::time::sleep(Duration::from_secs(timeout_secs)) => WaitOutcome::TimedOut,
        };

        manager.unregister_catalog_cancel();

        match outcome {
            WaitOutcome::Cancelled => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                let stdout = stdout_task.await.unwrap_or_default();
                let stderr = stderr_task.await.unwrap_or_default();
                Ok(CommandOutputPayload {
                    exit_code: -1,
                    stdout,
                    stderr,
                    success: false,
                    cancelled: true,
                })
            }
            WaitOutcome::TimedOut => {
                let _ = child.kill().await;
                let _ = child.wait().await;
                let _ = stdout_task.await;
                let _ = stderr_task.await;
                Err(AppHubError::TimeoutError(timeout_secs))
            }
            WaitOutcome::Done(res) => {
                let status = res.map_err(AppHubError::IoError)?;
                let stdout = stdout_task.await.unwrap_or_default();
                let stderr = stderr_task.await.unwrap_or_default();
                Ok(CommandOutputPayload {
                    exit_code: status.code().unwrap_or(-1),
                    stdout,
                    stderr,
                    success: status.success(),
                    cancelled: false,
                })
            }
        }
    }

    /// Async streaming execution with monotonic event sequencing, per-package concurrency lock, and awaited cancellation
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

        let seq = Arc::new(AtomicU64::new(0));
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

        // Emit explicit Preparing event immediately upon process spawn
        let prep_seq = seq.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = app.emit(
            "winget-output",
            WinGetOutputEvent {
                task_id: task_id.to_string(),
                event_sequence: prep_seq,
                stream: "status".to_string(),
                line: format!("Executing: winget {}", args.join(" ")),
                progress: None,
                progress_percent: None,
                is_indeterminate: true,
                bytes_downloaded: None,
                total_bytes: None,
                download_speed: None,
                phase: Some(OperationPhase::Preparing),
                status: OperationStatus::Running,
                message: Some("Preparing WinGet operation...".to_string()),
                timestamp: chrono::Utc::now().timestamp_millis(),
            },
        );

        let stdout_pipe = child.stdout.take();
        let stderr_pipe = child.stderr.take();

        let stdout_task = stdout_pipe.map(|pipe| {
            tokio::spawn(pump_stream(
                pipe,
                app.clone(),
                task_id.to_string(),
                "stdout".to_string(),
                Arc::clone(&seq),
            ))
        });
        let stderr_task = stderr_pipe.map(|pipe| {
            tokio::spawn(pump_stream(
                pipe,
                app.clone(),
                task_id.to_string(),
                "stderr".to_string(),
                Arc::clone(&seq),
            ))
        });

        let (cancel_tx, mut cancel_rx) = oneshot::channel::<()>();
        let (done_tx, done_rx) = watch::channel(false);
        manager.register_cancel(task_id, cancel_tx, done_rx);

        let mut was_cancelled = false;
        let status_res = tokio::select! {
            wait_res = child.wait() => Some(wait_res),
            _ = &mut cancel_rx => {
                was_cancelled = true;
                #[cfg(windows)]
                if let Some(pid) = child.id() {
                    let mut tk = Command::new("taskkill");
                    tk.args(["/PID", &pid.to_string(), "/T", "/F"])
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .stderr(Stdio::null())
                        .creation_flags(CREATE_NO_WINDOW);
                    let _ = tk.status().await;
                }
                let _ = child.kill().await;
                let _ = tokio::time::timeout(Duration::from_secs(3), child.wait()).await;
                None
            }
        };

        let _ = done_tx.send(true);
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
            let final_seq = seq.fetch_add(1, Ordering::SeqCst) + 1;
            let _ = app.emit(
                "winget-output",
                WinGetOutputEvent {
                    task_id: task_id.to_string(),
                    event_sequence: final_seq,
                    stream: "status".to_string(),
                    line: "Process terminated by user cancellation.".to_string(),
                    progress: None,
                    progress_percent: None,
                    is_indeterminate: false,
                    bytes_downloaded: None,
                    total_bytes: None,
                    download_speed: None,
                    phase: Some(OperationPhase::Cancelled),
                    status: OperationStatus::Cancelled,
                    message: Some("Process terminated by user cancellation.".to_string()),
                    timestamp: chrono::Utc::now().timestamp_millis(),
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

        let final_seq = seq.fetch_add(1, Ordering::SeqCst) + 1;
        let _ = app.emit(
            "winget-output",
            WinGetOutputEvent {
                task_id: task_id.to_string(),
                event_sequence: final_seq,
                stream: "status".to_string(),
                line: format!("WinGet process exited with code {}", exit_code),
                progress: if success { Some(100) } else { None },
                progress_percent: if success { Some(100.0) } else { None },
                is_indeterminate: false,
                bytes_downloaded: None,
                total_bytes: None,
                download_speed: None,
                phase: Some(if success {
                    OperationPhase::Completed
                } else {
                    OperationPhase::Failed
                }),
                status: if success {
                    OperationStatus::Completed
                } else {
                    OperationStatus::Failed
                },
                message: Some(format!("Process exited with code {}", exit_code)),
                timestamp: chrono::Utc::now().timestamp_millis(),
            },
        );

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
    fn test_progress_parser_percentages_ratios_and_false_match_rejection() {
        let p1 = parse_progress_from_line("Downloading... 64% 4.2 MB/s");
        assert_eq!(p1.progress_percent, Some(64.0));
        assert!(!p1.is_indeterminate);
        assert_eq!(p1.download_speed.as_deref(), Some("4.2 MB/s"));

        let p2 = parse_progress_from_line("  22.5 MiB / 45.0 MiB  1.25 MiB/s");
        assert!(p2.progress_percent.unwrap() > 49.9 && p2.progress_percent.unwrap() < 50.1);
        assert!(!p2.is_indeterminate);
        assert!(p2.bytes_downloaded.is_some());
        assert!(p2.total_bytes.is_some());
        assert_eq!(p2.download_speed.as_deref(), Some("1.25 MiB/s"));

        // Non-progress percentage prose must NOT fake progress
        let p3 = parse_progress_from_line("100% compatible open-source developer utility");
        assert_eq!(p3.progress_percent, None);
        assert!(p3.is_indeterminate);
        assert_eq!(p3.download_speed, None);

        // Indeterminate phase line
        let p4 = parse_progress_from_line("Starting package install...");
        assert_eq!(p4.progress_percent, None);
        assert!(p4.is_indeterminate);
    }

    #[test]
    fn test_utf8_byte_line_accumulator_split_across_chunks() {
        let mut acc = ByteLineAccumulator::default();
        // U+2588 '█' is [0xE2, 0x96, 0x88], split between chunks
        let chunk1 = b"Downloading \xE2\x96";
        let chunk2 = b"\x88 50%\rStarting package install...\n";

        let out1 = acc.push_bytes(chunk1);
        assert!(out1.is_empty());

        let out2 = acc.push_bytes(chunk2);
        assert_eq!(out2, vec!["Downloading █ 50%", "Starting package install..."]);
        assert!(acc.flush_remaining().is_none());
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
