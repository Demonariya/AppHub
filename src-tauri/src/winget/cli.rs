use crate::errors::AppHubError;
use crate::models::CommandOutputPayload;
use crate::security::validate_flag_argument;
use std::process::Command;

pub struct WinGetExecutor;

impl WinGetExecutor {
    /// Safe execution of WinGet binary using argument arrays (NO shell string concatenation)
    pub async fn execute(args: &[&str]) -> Result<CommandOutputPayload, AppHubError> {
        // Validate every argument to prevent injection
        for arg in args {
            if !validate_flag_argument(arg) {
                return Err(AppHubError::InvalidPackageId(format!(
                    "Illegal characters in argument: {}",
                    arg
                )));
            }
        }

        let output = Command::new("winget")
            .args(args)
            .output()
            .map_err(AppHubError::IoError)?;

        let exit_code = output.status.code().unwrap_or(-1);
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let success = output.status.success();

        Ok(CommandOutputPayload {
            exit_code,
            stdout,
            stderr,
            success,
        })
    }
}
