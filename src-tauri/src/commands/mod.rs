use crate::errors::AppHubError;
use crate::models::{CommandOutputPayload, WinGetPackage, WinGetShowDetails, WinGetSource};
use crate::security::validate_package_id;
use crate::winget::{
    detect_winget, parse_search_output, parse_show_output, parse_source_list_output,
    WinGetExecutor, WinGetInfo,
};

#[tauri::command]
pub async fn check_winget_environment() -> Result<WinGetInfo, AppHubError> {
    Ok(detect_winget())
}

#[tauri::command]
pub async fn winget_search(query: String) -> Result<Vec<WinGetPackage>, AppHubError> {
    let output = WinGetExecutor::execute(&["search", &query]).await?;
    if output.success {
        Ok(parse_search_output(&output.stdout))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_show(package_id: String) -> Result<WinGetShowDetails, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let output = WinGetExecutor::execute(&["show", "--id", &package_id, "--exact"]).await?;
    if output.success {
        Ok(parse_show_output(&output.stdout, &package_id))
    } else {
        Err(AppHubError::ExecutionFailed {
            code: Some(output.exit_code),
            stderr: output.stderr,
        })
    }
}

#[tauri::command]
pub async fn winget_install(
    package_id: String,
    silent: bool,
    force: bool,
    version: Option<String>,
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
    args.push("--accept-package-agreements");
    args.push("--accept-source-agreements");

    let v_str = version.clone();
    if let Some(ref v) = v_str {
        args.push("--version");
        args.push(v.as_str());
    }

    WinGetExecutor::execute(&args).await
}

#[tauri::command]
pub async fn winget_uninstall(
    package_id: String,
    silent: bool,
) -> Result<CommandOutputPayload, AppHubError> {
    if !validate_package_id(&package_id) {
        return Err(AppHubError::InvalidPackageId(package_id));
    }

    let mut args = vec!["uninstall", "--id", package_id.as_str(), "--exact"];
    if silent {
        args.push("--silent");
    }

    WinGetExecutor::execute(&args).await
}

#[tauri::command]
pub async fn winget_upgrade_all(silent: bool) -> Result<CommandOutputPayload, AppHubError> {
    let mut args = vec![
        "upgrade",
        "--all",
        "--accept-package-agreements",
        "--accept-source-agreements",
    ];
    if silent {
        args.push("--silent");
    }

    WinGetExecutor::execute(&args).await
}

#[tauri::command]
pub async fn winget_source_list() -> Result<Vec<WinGetSource>, AppHubError> {
    let output = WinGetExecutor::execute(&["source", "list"]).await?;
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
) -> Result<CommandOutputPayload, AppHubError> {
    WinGetExecutor::execute(&["source", "add", &name, &url]).await
}

#[tauri::command]
pub async fn winget_source_remove(name: String) -> Result<CommandOutputPayload, AppHubError> {
    WinGetExecutor::execute(&["source", "remove", &name]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_check_winget_environment_command() {
        let res = check_winget_environment().await;
        assert!(res.is_ok());
        let info = res.unwrap();
        assert!(!info.version.is_empty());
    }

    #[tokio::test]
    async fn test_invalid_package_id_rejection() {
        let invalid_ids = vec!["", "invalid id with spaces", "malicious; rm -rf /"];
        for id in invalid_ids {
            let res = winget_show(id.to_string()).await;
            assert!(res.is_err());
        }
    }
}

