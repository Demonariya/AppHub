pub mod cli;
pub mod detector;
pub mod parser;
pub mod size;

pub use cli::{OperationManager, WinGetExecutor};
pub use detector::{detect_winget, resolve_winget_binary, WinGetInfo};
pub use parser::{
    infer_category_from_metadata, inspect_search_result, parse_list_output, parse_search_output,
    parse_search_output_for_source, parse_show_output, parse_source_list_output,
    parse_upgrade_output, parse_versions_output,
};
pub use size::{collect_registry_app_sizes, probe_installer_download_size};
