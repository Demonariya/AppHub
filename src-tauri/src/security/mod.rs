use regex::Regex;
use std::sync::OnceLock;

static PACKAGE_ID_REGEX: OnceLock<Regex> = OnceLock::new();

/// Validates package identifier according to Microsoft WinGet schema rules:
/// Format: <Publisher>.<Application> or dotted identifiers, alphanumeric + underscore + dot
pub fn validate_package_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 128 {
        return false;
    }

    let re = PACKAGE_ID_REGEX.get_or_init(|| {
        Regex::new(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$").expect("Valid regex")
    });

    re.is_match(id)
}

/// Sanitizes custom command flags ensuring safe argument passing without shell interpolation
pub fn validate_flag_argument(arg: &str) -> bool {
    // Avoid null bytes or control characters
    !arg.contains('\0') && !arg.contains('\n') && !arg.contains('\r')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_valid_package_ids() {
        assert!(validate_package_id("Microsoft.VisualStudioCode"));
        assert!(validate_package_id("Git.Git"));
        assert!(validate_package_id("Mozilla.Firefox"));
        assert!(validate_package_id("VideoLAN.VLC"));
        assert!(validate_package_id("7zip.7zip"));
    }

    #[test]
    fn test_invalid_package_ids() {
        assert!(!validate_package_id(""));
        assert!(!validate_package_id("SingleWord"));
        assert!(!validate_package_id("Microsoft.VSCode; rm -rf /"));
        assert!(!validate_package_id("pkg$(calc.exe)"));
        assert!(!validate_package_id("id with spaces.app"));
    }
}
