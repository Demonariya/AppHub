use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetInfo {
    pub is_installed: bool,
    pub path: String,
    pub version: String,
    pub app_installer_available: bool,
    pub windows_version: String,
    pub architecture: String,
    pub error: Option<String>,
}

pub fn resolve_winget_binary(custom_path: Option<&str>) -> PathBuf {
    if let Some(custom) = custom_path {
        let trimmed = custom.trim();
        if !trimmed.is_empty() && !trimmed.contains('\0') && !trimmed.contains('\n') && !trimmed.contains('\r') {
            return PathBuf::from(trimmed);
        }
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let app_path = PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("WindowsApps")
            .join("winget.exe");
        if app_path.exists() {
            return app_path;
        }
    }

    PathBuf::from("winget")
}

fn detect_architecture() -> String {
    match std::env::consts::ARCH {
        "x86_64" => "x64".to_string(),
        "aarch64" => "arm64".to_string(),
        "x86" => "x86".to_string(),
        other => other.to_string(),
    }
}

fn detect_windows_version() -> String {
    #[cfg(windows)]
    {
        let mut cmd = Command::new("reg");
        cmd.args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion",
            "/v",
            "CurrentBuildNumber",
        ]);
        cmd.creation_flags(CREATE_NO_WINDOW);
        if let Ok(out) = cmd.output() {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                if let Some(build_str) = text.split_whitespace().last() {
                    if let Ok(build_num) = build_str.parse::<u32>() {
                        let edition = if build_num >= 22000 {
                            "Windows 11"
                        } else {
                            "Windows 10"
                        };
                        return format!("{} (Build {})", edition, build_num);
                    }
                }
            }
        }
        return "Windows".to_string();
    }
    #[cfg(not(windows))]
    {
        format!("{} ({})", std::env::consts::OS, std::env::consts::ARCH)
    }
}

pub fn detect_winget(custom_path: Option<&str>) -> WinGetInfo {
    let candidate_path = resolve_winget_binary(custom_path);
    let arch = detect_architecture();
    let windows_version = detect_windows_version();

    let mut cmd = Command::new(&candidate_path);
    cmd.arg("--version");
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.output() {
        Ok(out) if out.status.success() => {
            let version_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            WinGetInfo {
                is_installed: true,
                path: candidate_path.to_string_lossy().to_string(),
                version: if version_str.is_empty() {
                    "Installed (version unavailable)".to_string()
                } else {
                    version_str
                },
                app_installer_available: true,
                windows_version,
                architecture: arch,
                error: None,
            }
        }
        Ok(out) => {
            let err_msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
            WinGetInfo {
                is_installed: false,
                path: candidate_path.to_string_lossy().to_string(),
                version: "Not Detected".to_string(),
                app_installer_available: false,
                windows_version,
                architecture: arch,
                error: Some(if err_msg.is_empty() {
                    format!("winget --version exited with code {:?}", out.status.code())
                } else {
                    err_msg
                }),
            }
        }
        Err(err) => WinGetInfo {
            is_installed: false,
            path: candidate_path.to_string_lossy().to_string(),
            version: "Not Detected".to_string(),
            app_installer_available: false,
            windows_version,
            architecture: arch,
            error: Some(format!(
                "WinGet CLI (App Installer) could not be executed ({}). Install or update App Installer from Microsoft Store or https://aka.ms/getwinget.",
                err
            )),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_winget_info_serialization() {
        let info = WinGetInfo {
            is_installed: true,
            path: "C:\\Windows\\System32\\winget.exe".to_string(),
            version: "v1.9.25200".to_string(),
            app_installer_available: true,
            windows_version: "Windows 11 (Build 22631)".to_string(),
            architecture: "x64".to_string(),
            error: None,
        };
        let serialized = serde_json::to_string(&info).expect("Should serialize WinGetInfo");
        assert!(serialized.contains("v1.9.25200"));
        assert!(serialized.contains("is_installed"));

        let deserialized: WinGetInfo = serde_json::from_str(&serialized).expect("Should deserialize");
        assert_eq!(deserialized.version, "v1.9.25200");
        assert!(deserialized.is_installed);
    }

    #[test]
    fn test_detect_winget_does_not_panic_or_fabricate_version() {
        let info = detect_winget(None);
        assert!(!info.version.is_empty());
        if !info.is_installed {
            assert_eq!(info.version, "Not Detected");
            assert!(info.error.is_some());
        }
    }
}
