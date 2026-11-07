use std::path::PathBuf;
use std::process::Command;

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
