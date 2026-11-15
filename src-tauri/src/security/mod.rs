use regex::Regex;
use std::sync::OnceLock;

static PACKAGE_ID_REGEX: OnceLock<Regex> = OnceLock::new();
static MSSTORE_ID_REGEX: OnceLock<Regex> = OnceLock::new();

/// Validates package identifier according to Microsoft WinGet & MS Store schema rules:
/// - Dotted WinGet IDs: `<Publisher>.<Application>` (alphanumeric + `_` + `-` + `+` segments)
/// - Microsoft Store IDs: 10-20 uppercase alphanumeric characters containing at least one digit (e.g. `9WZDNCRFJ3TJ`)
pub fn validate_package_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 128 {
        return false;
    }

    let dotted_re = PACKAGE_ID_REGEX.get_or_init(|| {
        Regex::new(r"^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)+$").expect("Valid dotted regex")
    });
    if dotted_re.is_match(id) {
        return true;
    }

    let store_re = MSSTORE_ID_REGEX
        .get_or_init(|| Regex::new(r"^[A-Z0-9]{10,20}$").expect("Valid msstore regex"));
    store_re.is_match(id) && id.chars().any(|c| c.is_ascii_digit())
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
        assert!(validate_package_id("Notepad++.Notepad++"));
        assert!(validate_package_id("9WZDNCRFJ3TJ"));
        assert!(validate_package_id("XP89DCGQ3K6VLD"));
    }

    #[test]
    fn test_invalid_package_ids() {
        assert!(!validate_package_id(""));
        assert!(!validate_package_id("SingleWord"));
        assert!(!validate_package_id("SINGLEWORDNODIGITS"));
        assert!(!validate_package_id("Microsoft.VSCode; rm -rf /"));
        assert!(!validate_package_id("pkg$(calc.exe)"));
        assert!(!validate_package_id("id with spaces.app"));
    }
}
