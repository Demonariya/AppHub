use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetPackage {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub latest_version: String,
    pub description: String,
    pub category: String,
    pub source: String,
    pub architectures: Vec<String>,
    pub license: String,
    pub homepage: Option<String>,
    pub is_installed: bool,
    pub installed_version: Option<String>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetInstalledApp {
    pub id: String,
    pub name: String,
    pub version: String,
    pub available_version: Option<String>,
    pub source: Option<String>,
    pub is_winget_managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetUpgradeInfo {
    pub id: String,
    pub name: String,
    pub installed_version: String,
    pub available_version: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetShowDetails {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub author: Option<String>,
    pub description: String,
    pub homepage: Option<String>,
    pub publisher_url: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub release_date: Option<String>,
    pub release_notes: Option<String>,
    pub installer_type: Option<String>,
    pub installer_url: Option<String>,
    pub installer_sha256: Option<String>,
    pub architectures: Vec<String>,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetSource {
    pub name: String,
    pub argument: String,
    pub source_type: String,
    pub is_official: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandOutputPayload {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WinGetOutputEvent {
    pub task_id: String,
    pub stream: String,
    pub line: String,
    pub progress: Option<u8>,
    pub is_indeterminate: bool,
    pub download_speed: Option<String>,
    pub phase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryRecord {
    pub id: String,
    pub package_id: String,
    pub package_name: String,
    pub action: String,
    pub version: String,
    pub status: String,
    pub error_message: Option<String>,
    pub exit_code: Option<i32>,
    pub start_time: i64,
    pub end_time: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionRecord {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_name: String,
    pub package_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}
