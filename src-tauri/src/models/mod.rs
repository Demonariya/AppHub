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
pub struct WinGetShowDetails {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub author: Option<String>,
    pub description: String,
    pub homepage: Option<String>,
    pub license: Option<String>,
    pub license_url: Option<String>,
    pub installer_type: Option<String>,
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
}
