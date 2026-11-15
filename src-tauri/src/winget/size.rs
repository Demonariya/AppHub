use std::collections::HashMap;
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Default, Clone)]
pub struct RegistryAppSizeIndex {
    by_key: HashMap<String, u64>,
    by_name: HashMap<String, u64>,
    by_base_name: HashMap<String, u64>,
}

impl RegistryAppSizeIndex {
    pub fn merge(&mut self, other: RegistryAppSizeIndex) {
        self.by_key.extend(other.by_key);
        self.by_name.extend(other.by_name);
        self.by_base_name.extend(other.by_base_name);
    }

    pub fn lookup_installed_size(&self, app_id: &str, app_name: &str) -> Option<u64> {
        if app_id.starts_with("ARP\\") {
            if let Some(subkey) = app_id.rsplit('\\').next() {
                let normalized_key = subkey.trim().to_lowercase();
                if let Some(&bytes) = self.by_key.get(&normalized_key) {
                    return Some(bytes);
                }
            }
        }

        let normalized_name = normalize_app_name(app_name);
        if !normalized_name.is_empty() {
            if let Some(&bytes) = self.by_name.get(&normalized_name) {
                return Some(bytes);
            }
            let base = strip_parenthetical_suffix(&normalized_name);
            if !base.is_empty() {
                if let Some(&bytes) = self.by_base_name.get(&base) {
                    return Some(bytes);
                }
            }
        }

        None
    }
}

fn normalize_app_name(name: &str) -> String {
    name.trim().to_lowercase()
}

fn strip_parenthetical_suffix(normalized: &str) -> String {
    let mut s = normalized.trim();
    while s.ends_with(')') {
        if let Some(open_idx) = s.rfind('(') {
            let candidate = s[..open_idx].trim();
            if !candidate.is_empty() {
                s = candidate;
                continue;
            }
        }
        break;
    }
    s.to_string()
}

fn parse_dword_kb(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if let Some(hex) = trimmed.strip_prefix("0x").or_else(|| trimmed.strip_prefix("0X")) {
        u64::from_str_radix(hex, 16).ok()
    } else {
        trimmed.parse::<u64>().ok()
    }
}

/// Parses `reg query <UninstallRoot> /s` output into an index of installed app byte sizes.
/// Windows `EstimatedSize` registry DWORD values are recorded in kilobytes (KiB).
pub fn parse_reg_uninstall_output(output: &str) -> RegistryAppSizeIndex {
    let mut index = RegistryAppSizeIndex::default();

    let mut current_subkey: Option<String> = None;
    let mut current_name: Option<String> = None;
    let mut current_kb: Option<u64> = None;

    let flush_entry = |subkey: &mut Option<String>,
                       name: &mut Option<String>,
                       kb: &mut Option<u64>,
                       idx: &mut RegistryAppSizeIndex| {
        if let Some(size_kb) = *kb {
            if size_kb > 0 {
                let bytes = size_kb.saturating_mul(1024);
                if let Some(ref k) = *subkey {
                    idx.by_key.insert(k.to_lowercase(), bytes);
                }
                if let Some(ref n) = *name {
                    let norm = normalize_app_name(n);
                    if !norm.is_empty() {
                        idx.by_name.insert(norm.clone(), bytes);
                        let base = strip_parenthetical_suffix(&norm);
                        if !base.is_empty() {
                            idx.by_base_name.entry(base).or_insert(bytes);
                        }
                    }
                }
            }
        }
        *subkey = None;
        *name = None;
        *kb = None;
    };

    for raw_line in output.lines() {
        let line = raw_line.trim_end();
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with("HKEY_") {
            flush_entry(&mut current_subkey, &mut current_name, &mut current_kb, &mut index);
            if let Some(leaf) = trimmed.rsplit('\\').next() {
                if !leaf.is_empty() {
                    current_subkey = Some(leaf.to_string());
                }
            }
            continue;
        }

        if let Some(rest) = trimmed.strip_prefix("DisplayName") {
            if let Some(idx_sz) = rest.find("REG_SZ").or_else(|| rest.find("REG_EXPAND_SZ")) {
                let after_type = if rest[idx_sz..].starts_with("REG_EXPAND_SZ") {
                    &rest[idx_sz + "REG_EXPAND_SZ".len()..]
                } else {
                    &rest[idx_sz + "REG_SZ".len()..]
                };
                let val = after_type.trim();
                if !val.is_empty() {
                    current_name = Some(val.to_string());
                }
            }
        } else if let Some(rest) = trimmed.strip_prefix("EstimatedSize") {
            if let Some(idx_dw) = rest.find("REG_DWORD") {
                let after_type = rest[idx_dw + "REG_DWORD".len()..].trim();
                if let Some(token) = after_type.split_whitespace().next() {
                    current_kb = parse_dword_kb(token);
                }
            }
        }
    }

    flush_entry(&mut current_subkey, &mut current_name, &mut current_kb, &mut index);
    index
}

#[cfg(windows)]
async fn query_reg_uninstall_hive(hive_path: &str) -> RegistryAppSizeIndex {
    let mut cmd = Command::new("reg");
    cmd.args(["query", hive_path, "/s"])
        .kill_on_drop(true)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());

    cmd.creation_flags(CREATE_NO_WINDOW);

    let Ok(child) = cmd.spawn() else {
        return RegistryAppSizeIndex::default();
    };

    match tokio::time::timeout(Duration::from_secs(4), child.wait_with_output()).await {
        Ok(Ok(out)) if out.status.success() || !out.stdout.is_empty() => {
            let text = String::from_utf8_lossy(&out.stdout);
            parse_reg_uninstall_output(&text)
        }
        _ => RegistryAppSizeIndex::default(),
    }
}

pub async fn collect_registry_app_sizes() -> RegistryAppSizeIndex {
    #[cfg(windows)]
    {
        let (hklm, wow64, hkcu) = tokio::join!(
            query_reg_uninstall_hive(
                r"HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
            ),
            query_reg_uninstall_hive(
                r"HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
            ),
            query_reg_uninstall_hive(
                r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
            ),
        );
        let mut combined = RegistryAppSizeIndex::default();
        combined.merge(hklm);
        combined.merge(wow64);
        combined.merge(hkcu);
        combined
    }
    #[cfg(not(windows))]
    {
        RegistryAppSizeIndex::default()
    }
}

/// Extracts the final positive `Content-Length` header value across HTTP redirect responses.
pub fn parse_content_length_from_headers(headers: &str) -> Option<u64> {
    let mut last_valid: Option<u64> = None;
    for line in headers.lines() {
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") {
                if let Ok(bytes) = value.trim().parse::<u64>() {
                    if bytes > 0 {
                        last_valid = Some(bytes);
                    }
                }
            }
        }
    }
    last_valid
}

/// Performs a lightweight HTTP HEAD request using the built-in system `curl` binary
/// to resolve the installer's exact `Content-Length` in bytes without downloading the file.
pub async fn probe_installer_download_size(url: &str) -> Option<u64> {
    let trimmed = url.trim();
    if trimmed.is_empty()
        || trimmed.len() > 2048
        || !(trimmed.starts_with("https://") || trimmed.starts_with("http://"))
        || trimmed.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }

    let curl_bin = if cfg!(windows) { "curl.exe" } else { "curl" };
    let mut cmd = Command::new(curl_bin);
    cmd.args([
        "-s",
        "-I",
        "-L",
        "--max-redirs",
        "5",
        "--max-time",
        "4",
        "--",
        trimmed,
    ])
    .kill_on_drop(true)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd.spawn().ok()?;
    let output = tokio::time::timeout(Duration::from_secs(5), child.wait_with_output())
        .await
        .ok()?
        .ok()?;

    if !output.status.success() && output.stdout.is_empty() {
        return None;
    }

    let headers = String::from_utf8_lossy(&output.stdout);
    parse_content_length_from_headers(&headers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_reg_uninstall_output_and_lookup() {
        let sample = r#"
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Mozilla Firefox 133.0.3 (x64 en-US)
    DisplayName    REG_SZ    Mozilla Firefox (x64 en-US)
    DisplayVersion    REG_SZ    133.0.3
    EstimatedSize    REG_DWORD    0x3b800

HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\CustomTool_is1
    DisplayName    REG_SZ    Custom Local Tool
    EstimatedSize    REG_DWORD    15360
"#;
        let idx = parse_reg_uninstall_output(sample);
        assert_eq!(
            idx.lookup_installed_size("Mozilla.Firefox", "Mozilla Firefox"),
            Some(0x3b800 * 1024)
        );
        assert_eq!(
            idx.lookup_installed_size("ARP\\Machine\\X64\\CustomTool_is1", "Anything"),
            Some(15360 * 1024)
        );
    }

    #[test]
    fn test_parse_content_length_across_redirects() {
        let headers = "\
HTTP/1.1 302 Found\r\n\
Location: https://cdn.example.com/installer.exe\r\n\
Content-Length: 0\r\n\
\r\n\
HTTP/2 200\r\n\
content-type: application/octet-stream\r\n\
Content-Length: 103179878\r\n\
";
        assert_eq!(parse_content_length_from_headers(headers), Some(103_179_878));
    }
}
