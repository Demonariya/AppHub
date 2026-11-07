pub mod cli;
pub mod detector;
pub mod parser;

pub use cli::WinGetExecutor;
pub use detector::{detect_winget, WinGetInfo};
pub use parser::{parse_search_output, parse_show_output, parse_source_list_output};
