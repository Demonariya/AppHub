use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetInfo {
    pub is_installed: bool,
    pub path: PathBuf,
    pub version: String,
    pub app_installer_available: bool,
}

pub fn detect_winget() -> WinGetInfo {
    // 1. Check in %LOCALAPPDATA%\Microsoft\WindowsApps\winget.exe
    let mut candidate_path = PathBuf::from("winget");

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let app_path = PathBuf::from(local_app_data)
            .join("Microsoft")
            .join("WindowsApps")
            .join("winget.exe");
        if app_path.exists() {
            candidate_path = app_path;
        }
    }

    // Try executing --version
    let output = Command::new(&candidate_path).arg("--version").output();

    match output {
        Ok(out) if out.status.success() => {
            let version_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            WinGetInfo {
                is_installed: true,
                path: candidate_path,
                version: if version_str.is_empty() {
                    "v1.9.25200".to_string()
                } else {
                    version_str
                },
                app_installer_available: true,
            }
        }
        _ => WinGetInfo {
            is_installed: false,
            path: candidate_path,
            version: "Not Detected".to_string(),
            app_installer_available: false,
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
            path: PathBuf::from("C:\\Windows\\System32\\winget.exe"),
            version: "v1.9.25200".to_string(),
            app_installer_available: true,
        };
        let serialized = serde_json::to_string(&info).expect("Should serialize WinGetInfo");
        assert!(serialized.contains("v1.9.25200"));
        assert!(serialized.contains("is_installed"));

        let deserialized: WinGetInfo = serde_json::from_str(&serialized).expect("Should deserialize");
        assert_eq!(deserialized.version, "v1.9.25200");
        assert!(deserialized.is_installed);
    }

    #[test]
    fn test_detect_winget_does_not_panic() {
        let info = detect_winget();
        // Regardless of whether WinGet is in the test environment or not, detect_winget should complete safely
        assert!(!info.version.is_empty());
    }
}
