use serde::Serialize;
use std::{path::PathBuf, process::Stdio, time::Duration};
use tokio::{io::AsyncReadExt, process::Command, time::timeout};

#[derive(Serialize, Clone)]
struct PackageRow {
    name: String,
    id: String,
    version: String,
    available_version: Option<String>,
    source: Option<String>,
}

#[derive(Serialize)]
struct WingetStatus {
    available: bool,
    version: Option<String>,
    path: Option<String>,
    app_installer: bool,
}

#[derive(Serialize)]
struct SourceRow {
    name: String,
    argument: String,
    source_type: String,
}

#[derive(Serialize)]
struct CommandResult {
    success: bool,
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn winget_path() -> Option<PathBuf> {
    which::which("winget").ok().or_else(|| {
        let local = std::env::var_os("LOCALAPPDATA")?;
        let root = PathBuf::from(local).join("Microsoft/WindowsApps/winget.exe");
        root.exists().then_some(root)
    })
}

async fn run_winget(args: &[&str]) -> Result<CommandResult, String> {
    let exe = winget_path().ok_or_else(|| "WinGet was not found. Install or update Microsoft App Installer.".to_string())?;
    let mut child = Command::new(exe)
        .args(args)
        .arg("--disable-interactivity")
        .env("WINGET_OUTPUT_LOCALE", "en-US")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to start WinGet: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Could not capture WinGet stdout")?;
    let mut stderr = child.stderr.take().ok_or("Could not capture WinGet stderr")?;
    let out_task = tokio::spawn(async move {
        let mut data = Vec::new();
        let _ = stdout.read_to_end(&mut data).await;
        String::from_utf8_lossy(&data).into_owned()
    });
    let err_task = tokio::spawn(async move {
        let mut data = Vec::new();
        let _ = stderr.read_to_end(&mut data).await;
        String::from_utf8_lossy(&data).into_owned()
    });

    let status = timeout(Duration::from_secs(900), child.wait())
        .await
        .map_err(|_| "WinGet operation timed out after 15 minutes".to_string())?
        .map_err(|e| format!("WinGet process error: {e}"))?;
    let out = out_task.await.unwrap_or_default();
    let err = err_task.await.unwrap_or_default();
    Ok(CommandResult {
        success: status.success(),
        code: status.code(),
        stdout: out,
        stderr: err,
    })
}

fn parse_table(output: &str, has_available: bool) -> Vec<PackageRow> {
    let mut lines = output.lines();
    let header = match lines.find(|line| line.contains("Name") && line.contains("Id")) {
        Some(line) => line,
        None => return Vec::new(),
    };
    let name_at = header.find("Name").unwrap_or(0);
    let id_at = header.find("Id").unwrap_or(name_at + 1);
    let version_at = header.find("Version").unwrap_or(id_at + 1);
    let available_at = if has_available { header.find("Available").or_else(|| header.find("Available Version")) } else { None };
    let source_at = header.find("Source");
    let mut rows = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.chars().all(|c| c == '-' || c == ' ') || trimmed.starts_with("The following") {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let slice = |start: usize, end: Option<usize>| -> String {
            if start >= chars.len() { return String::new(); }
            chars[start..end.unwrap_or(chars.len()).min(chars.len())].iter().collect::<String>().trim().to_string()
        };
        let name = slice(name_at, Some(id_at));
        let id = slice(id_at, Some(version_at));
        let version = slice(version_at, available_at.or(source_at));
        let available_version = available_at.map(|at| slice(at, source_at));
        let source = source_at.map(|at| slice(at, None));
        if !id.is_empty() && id.contains('.') && !name.is_empty() {
            rows.push(PackageRow { name, id, version, available_version, source });
        }
    }
    rows
}

fn validate_id(id: &str) -> Result<(), String> {
    let valid = !id.is_empty()
        && id.len() <= 255
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'));
    if valid { Ok(()) } else { Err("Invalid package ID. Only letters, numbers, dot, dash, underscore and plus are accepted.".into()) }
}

#[tauri::command]
async fn winget_status() -> WingetStatus {
    let path = winget_path();
    let version = if path.is_some() {
        run_winget(&["--version"]).await.ok().map(|r| r.stdout.trim().to_string()).filter(|s| !s.is_empty())
    } else { None };
    WingetStatus {
        available: path.is_some(),
        version,
        path: path.map(|p| p.display().to_string()),
        app_installer: path.is_some(),
    }
}

#[tauri::command]
async fn winget_search(query: String) -> Result<Vec<PackageRow>, String> {
    let q = query.trim();
    if q.len() > 200 { return Err("Search query is too long.".into()); }
    if q.is_empty() {
        let result = run_winget(&["search", "--source", "winget"]).await?;
        if !result.success { return Err(result.stderr); }
        return Ok(parse_table(&result.stdout, false));
    }
    let result = run_winget(&["search", q, "--source", "winget"]).await?;
    if !result.success { return Err(if result.stderr.is_empty() { result.stdout } else { result.stderr }); }
    Ok(parse_table(&result.stdout, false))
}

#[tauri::command]
async fn winget_list() -> Result<Vec<PackageRow>, String> {
    let result = run_winget(&["list"]).await?;
    if !result.success { return Err(if result.stderr.is_empty() { result.stdout } else { result.stderr }); }
    Ok(parse_table(&result.stdout, false))
}

#[tauri::command]
async fn winget_updates() -> Result<Vec<PackageRow>, String> {
    let result = run_winget(&["upgrade"]).await?;
    if !result.success { return Err(if result.stderr.is_empty() { result.stdout } else { result.stderr }); }
    Ok(parse_table(&result.stdout, true))
}

#[tauri::command]
async fn winget_sources() -> Result<Vec<SourceRow>, String> {
    let result = run_winget(&["source", "list"]).await?;
    if !result.success { return Err(if result.stderr.is_empty() { result.stdout } else { result.stderr }); }
    let mut rows = Vec::new();
    for line in result.stdout.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 && !parts[0].eq_ignore_ascii_case("Name") && !parts[0].starts_with('-') {
            rows.push(SourceRow { name: parts[0].to_string(), argument: parts[1].to_string(), source_type: parts[2..].join(" ") });
        }
    }
    Ok(rows)
}

#[tauri::command]
async fn winget_install(id: String) -> Result<CommandResult, String> {
    validate_id(&id)?;
    run_winget(&["install", "--id", &id, "--exact", "--source", "winget", "--accept-package-agreements", "--accept-source-agreements"]).await
}

#[tauri::command]
async fn winget_uninstall(id: String) -> Result<CommandResult, String> {
    validate_id(&id)?;
    run_winget(&["uninstall", "--id", &id, "--exact"]).await
}

#[tauri::command]
async fn winget_upgrade(id: String) -> Result<CommandResult, String> {
    validate_id(&id)?;
    run_winget(&["upgrade", "--id", &id, "--exact", "--accept-package-agreements", "--accept-source-agreements"]).await
}

#[tauri::command]
async fn winget_upgrade_all() -> Result<CommandResult, String> {
    run_winget(&["upgrade", "--all", "--accept-package-agreements", "--accept-source-agreements"]).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_package_ids() {
        assert!(validate_id("Microsoft.VisualStudioCode").is_ok());
        assert!(validate_id("Vendor.App_2").is_ok());
        assert!(validate_id("bad id; whoami").is_err());
        assert!(validate_id("").is_err());
    }
    #[test]
    fn parses_search_table() {
        let sample = "Name                         Id                         Version\n---------------------------------------------------------------\nVisual Studio Code           Microsoft.VisualStudioCode 1.90.0";
        let rows = parse_table(sample, false);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "Microsoft.VisualStudioCode");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            winget_status, winget_search, winget_list, winget_updates, winget_sources,
            winget_install, winget_uninstall, winget_upgrade, winget_upgrade_all
        ])
        .run(tauri::generate_context!())
        .expect("error while running AppHub");
}
