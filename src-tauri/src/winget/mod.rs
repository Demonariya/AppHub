pub mod cli;
pub mod detector;
pub mod parser;

pub use cli::{OperationManager, WinGetExecutor};
pub use detector::{detect_winget, resolve_winget_binary, WinGetInfo};
pub use parser::{
    parse_list_output, parse_search_output, parse_show_output, parse_source_list_output,
    parse_upgrade_output, parse_versions_output,
};
