use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppHubError {
    #[error("WinGet CLI was not found on this system")]
    WinGetNotFound,

    #[error("Invalid package identifier: {0}")]
    InvalidPackageId(String),

    #[error("WinGet command execution failed with exit code: {code:?}, stderr: {stderr}")]
    ExecutionFailed {
        code: Option<i32>,
        stderr: String,
    },

    #[error("Process was cancelled by user")]
    OperationCancelled,

    #[error("Database error: {0}")]
    DatabaseError(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

impl serde::Serialize for AppHubError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
