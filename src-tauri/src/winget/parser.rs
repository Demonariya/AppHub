use crate::models::{
    WinGetInstalledApp, WinGetPackage, WinGetShowDetails, WinGetSource, WinGetUpgradeInfo,
};

fn normalize_winget_lines(output: &str) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in output.lines() {
        // WinGet writes spinner frames and progress updates separated by \r
        let segment = raw_line.split('\r').next_back().unwrap_or(raw_line);
        let trimmed = segment.trim_end();
        if trimmed.trim().is_empty() {
            continue;
        }
        // Skip pure spinner / box progress bar lines
        let s = trimmed.trim();
        if s == "-" || s == "\\" || s == "|" || s == "/" || s.starts_with('█') || s.starts_with('▒') {
            continue;
        }
        lines.push(trimmed.to_string());
    }
    lines
}

fn is_separator_line(line: &str) -> bool {
    let t = line.trim();
    t.len() >= 5 && t.chars().all(|c| c == '-')
}

/// Extract character-index column starts from a tabular header line.
/// e.g. "Name          Id                 Version   Available   Source"
fn extract_column_starts(header: &str) -> Vec<(String, usize)> {
    let mut cols = Vec::new();
    let mut in_word = false;
    let mut word_start = 0usize;
    let mut current = String::new();

    for (idx, ch) in header.chars().enumerate() {
        if ch.is_whitespace() {
            if in_word {
                cols.push((current.to_lowercase(), word_start));
                current.clear();
                in_word = false;
            }
        } else {
            if !in_word {
                in_word = true;
                word_start = idx;
            }
            current.push(ch);
        }
    }
    if in_word && !current.is_empty() {
        cols.push((current.to_lowercase(), word_start));
    }

    cols
}

fn slice_char_range(line: &str, start_char: usize, end_char: Option<usize>) -> String {
    let chars: Vec<char> = line.chars().collect();
    if start_char >= chars.len() {
        return String::new();
    }
    let end = match end_char {
        Some(e) => e.min(chars.len()),
        None => chars.len(),
    };
    if start_char >= end {
        return String::new();
    }
    chars[start_char..end]
        .iter()
        .collect::<String>()
        .trim()
        .to_string()
}

fn parse_table_rows(output: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let lines = normalize_winget_lines(output);
    let mut sep_idx = None;

    for (idx, line) in lines.iter().enumerate() {
        if is_separator_line(line) && idx > 0 {
            sep_idx = Some(idx);
            break;
        }
    }

    let Some(s_idx) = sep_idx else {
        return (Vec::new(), Vec::new());
    };

    let header_line = &lines[s_idx - 1];
    let col_defs = extract_column_starts(header_line);
    if col_defs.len() < 2 {
        return (Vec::new(), Vec::new());
    }

    let headers: Vec<String> = col_defs.iter().map(|(name, _)| name.clone()).collect();
    let mut rows = Vec::new();

    for line in &lines[(s_idx + 1)..] {
        // Skip common WinGet footer summaries after the table
        let lower = line.trim().to_lowercase();
        if lower.ends_with("upgrades available.")
            || lower.ends_with("upgrade available.")
            || lower.contains("package(s) have version numbers")
            || lower.contains("require explicit targeting")
            || lower.starts_with("the following packages")
            || lower.starts_with("no package found")
        {
            break;
        }

        let mut cells = Vec::with_capacity(col_defs.len());
        for i in 0..col_defs.len() {
            let start = col_defs[i].1;
            let end = if i + 1 < col_defs.len() {
                Some(col_defs[i + 1].1)
            } else {
                None
            };
            cells.push(slice_char_range(line, start, end));
        }

        if cells.len() >= 2 && !cells[0].is_empty() && !cells[1].is_empty() {
            rows.push(cells);
        }
    }

    (headers, rows)
}

fn find_col_index(headers: &[String], candidates: &[&str], fallback: usize) -> Option<usize> {
    for c in candidates {
        if let Some(pos) = headers.iter().position(|h| h == c) {
            return Some(pos);
        }
    }
    if fallback < headers.len() {
        Some(fallback)
    } else {
        None
    }
}

/// Parse tabular output from `winget search`
pub fn parse_search_output(output: &str) -> Vec<WinGetPackage> {
    let (headers, rows) = parse_table_rows(output);
    let mut packages = Vec::new();

    if headers.is_empty() {
        return packages;
    }

    let name_idx = find_col_index(&headers, &["name"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version"], 2);
    let src_idx = headers.iter().position(|h| h == "source");

    for row in rows {
        let name = row.get(name_idx).cloned().unwrap_or_default();
        let id = row.get(id_idx).cloned().unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let version = ver_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "Unknown".to_string());
        let source = src_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "winget".to_string());

        let publisher = id
            .split('.')
            .next()
            .filter(|s| !s.is_empty())
            .unwrap_or("Unknown")
            .to_string();

        packages.push(WinGetPackage {
            id: id.clone(),
            name: if name.is_empty() { id.clone() } else { name },
            publisher,
            version: version.clone(),
            latest_version: version,
            description: format!("WinGet package from {} source", source),
            category: "Utilities".to_string(),
            source,
            architectures: vec!["x64".to_string()],
            license: "See package details".to_string(),
            homepage: None,
            is_installed: false,
            installed_version: None,
            is_pinned: false,
        });
    }

    packages
}

/// Parse tabular output from `winget list`
pub fn parse_list_output(output: &str) -> Vec<WinGetInstalledApp> {
    let (headers, rows) = parse_table_rows(output);
    let mut apps = Vec::new();

    if headers.is_empty() {
        return apps;
    }

    let name_idx = find_col_index(&headers, &["name"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version"], 2);
    let avail_idx = headers.iter().position(|h| h == "available");
    let src_idx = headers.iter().position(|h| h == "source");

    for row in rows {
        let name = row.get(name_idx).cloned().unwrap_or_default();
        let id = row.get(id_idx).cloned().unwrap_or_default();
        if id.is_empty() {
            continue;
        }
        let version = ver_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| "Unknown".to_string());
        let available_version = avail_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|v| !v.is_empty());
        let source = src_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|s| !s.is_empty());

        let is_arp_or_msix = id.starts_with("ARP\\") || id.starts_with("MSIX\\");
        let is_winget_managed = source.is_some() && !is_arp_or_msix;

        apps.push(WinGetInstalledApp {
            id: id.clone(),
            name: if name.is_empty() { id } else { name },
            version,
            available_version,
            source,
            is_winget_managed,
        });
    }

    apps
}

/// Parses output from `winget upgrade` (detects available updates)
pub fn parse_upgrade_output(output: &str) -> Vec<WinGetUpgradeInfo> {
    let (headers, rows) = parse_table_rows(output);
    let mut upgrades = Vec::new();

    if headers.is_empty() {
        return upgrades;
    }

    let name_idx = find_col_index(&headers, &["name"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version"], 2);
    let avail_idx = find_col_index(&headers, &["available"], 3);
    let src_idx = headers.iter().position(|h| h == "source");

    for row in rows {
        let name = row.get(name_idx).cloned().unwrap_or_default();
        let id = row.get(id_idx).cloned().unwrap_or_default();
        let installed = ver_idx.and_then(|i| row.get(i)).cloned().unwrap_or_default();
        let available = avail_idx.and_then(|i| row.get(i)).cloned().unwrap_or_default();
        let source = src_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "winget".to_string());

        if !id.is_empty() && !installed.is_empty() && !available.is_empty() && installed != available {
            upgrades.push(WinGetUpgradeInfo {
                id: id.clone(),
                name: if name.is_empty() { id } else { name },
                installed_version: installed,
                available_version: available,
                source,
            });
        }
    }

    upgrades
}

/// Parses key-value & multi-line output from `winget show --id <id>`
pub fn parse_show_output(output: &str, package_id: &str) -> WinGetShowDetails {
    let mut name = package_id.to_string();
    let mut publisher = "Unknown Publisher".to_string();
    let mut version = "Unknown".to_string();
    let mut author = None;
    let mut description = String::new();
    let mut homepage = None;
    let mut publisher_url = None;
    let mut license = None;
    let mut license_url = None;
    let mut release_date = None;
    let mut release_notes = None;
    let mut installer_sha256 = None;
    let mut installer_type = None;
    let mut installer_url = None;
    let mut tags: Vec<String> = Vec::new();
    let mut active_block: Option<String> = None;

    for raw_line in output.lines() {
        let line = raw_line.split('\r').next_back().unwrap_or(raw_line);
        if line.trim().is_empty() {
            continue;
        }

        // Handle "Found <Name> [<Id>]" line (no colon on modern winget)
        let trimmed = line.trim();
        if trimmed.starts_with("Found ") && !trimmed.starts_with("Found:") {
            let without_prefix = trimmed.trim_start_matches("Found ").trim();
            if let Some(bracket_pos) = without_prefix.rfind('[') {
                let parsed_name = without_prefix[..bracket_pos].trim();
                if !parsed_name.is_empty() {
                    name = parsed_name.to_string();
                }
            } else if !without_prefix.is_empty() {
                name = without_prefix.to_string();
            }
            active_block = None;
            continue;
        }

        let is_indented = line.starts_with(' ') || line.starts_with('\t');

        if let Some((key, val)) = trimmed.split_once(':') {
            // Check if value looks like a URL continuation inside a block
            let k = key.trim().to_lowercase();
            let v = val.trim().to_string();

            if is_indented && k.starts_with("http") {
                if active_block.as_deref() == Some("description") {
                    if !description.is_empty() {
                        description.push(' ');
                    }
                    description.push_str(trimmed);
                    continue;
                }
            }

            active_block = Some(k.clone());
            match k.as_str() {
                "found" => {
                    if let Some(bp) = v.rfind('[') {
                        let parsed = v[..bp].trim();
                        if !parsed.is_empty() {
                            name = parsed.to_string();
                        }
                    } else if !v.is_empty() {
                        name = v;
                    }
                }
                "publisher" => {
                    if !v.is_empty() {
                        publisher = v;
                    }
                }
                "publisher url" => {
                    if !v.is_empty() {
                        publisher_url = Some(v);
                    }
                }
                "author" => {
                    if !v.is_empty() {
                        author = Some(v);
                    }
                }
                "version" => {
                    if !v.is_empty() {
                        version = v;
                    }
                }
                "description" => {
                    if !v.is_empty() {
                        description = v;
                    }
                }
                "homepage" => {
                    if !v.is_empty() {
                        homepage = Some(v);
                    }
                }
                "license" => {
                    if !v.is_empty() {
                        license = Some(v);
                    }
                }
                "license url" => {
                    if !v.is_empty() {
                        license_url = Some(v);
                    }
                }
                "release date" => {
                    if !v.is_empty() {
                        release_date = Some(v);
                    }
                }
                "release notes" => {
                    if !v.is_empty() {
                        release_notes = Some(v);
                    }
                }
                "sha256" | "installer sha256" => {
                    if !v.is_empty() {
                        installer_sha256 = Some(v);
                    }
                }
                "type" | "installer type" => {
                    if !v.is_empty() {
                        installer_type = Some(v);
                    }
                }
                "download url" | "installer url" => {
                    if !v.is_empty() {
                        installer_url = Some(v);
                    }
                }
                "tags" => {
                    if !v.is_empty() {
                        tags = v
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect();
                    }
                }
                _ => {}
            }
        } else if is_indented {
            match active_block.as_deref() {
                Some("description") => {
                    if !description.is_empty() {
                        description.push(' ');
                    }
                    description.push_str(trimmed);
                }
                Some("release notes") => {
                    let existing = release_notes.get_or_insert_with(String::new);
                    if !existing.is_empty() {
                        existing.push('\n');
                    }
                    existing.push_str(trimmed);
                }
                Some("tags") => {
                    if !trimmed.is_empty() {
                        tags.push(trimmed.to_string());
                    }
                }
                _ => {}
            }
        }
    }

    WinGetShowDetails {
        id: package_id.to_string(),
        name,
        publisher,
        version,
        author,
        description,
        homepage,
        publisher_url,
        license,
        license_url,
        release_date,
        release_notes,
        installer_type,
        installer_url,
        installer_sha256,
        architectures: vec!["x64".to_string()],
        tags,
    }
}

/// Parses `winget show --id <id> --versions`
pub fn parse_versions_output(output: &str) -> Vec<String> {
    let lines = normalize_winget_lines(output);
    let mut start = false;
    let mut versions = Vec::new();

    for line in lines {
        let trimmed = line.trim();
        if is_separator_line(trimmed) {
            start = true;
            continue;
        }
        if !start {
            continue;
        }
        if !trimmed.is_empty() && !trimmed.contains(' ') {
            versions.push(trimmed.to_string());
        }
    }

    versions
}

/// Parses `winget source list`
pub fn parse_source_list_output(output: &str) -> Vec<WinGetSource> {
    let (headers, rows) = parse_table_rows(output);
    let mut sources = Vec::new();

    if headers.is_empty() {
        return sources;
    }

    let name_idx = find_col_index(&headers, &["name"], 0).unwrap_or(0);
    let arg_idx = find_col_index(&headers, &["argument", "arg"], 1).unwrap_or(1);

    for row in rows {
        let name = row.get(name_idx).cloned().unwrap_or_default();
        let argument = row.get(arg_idx).cloned().unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let is_official = name == "winget" || name == "msstore";

        sources.push(WinGetSource {
            name,
            argument,
            source_type: "Microsoft.PreIndexed.Package".to_string(),
            is_official,
        });
    }

    sources
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_output_with_spinner() {
        let raw = "\r   - \r\
Name                   Id                         Version    Match        Source\n\
--------------------------------------------------------------------------------\n\
Visual Studio Code     Microsoft.VisualStudioCode 1.95.3                  winget\n\
Git                    Git.Git                    2.47.1     Tag: git     winget\n";
        let pkgs = parse_search_output(raw);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(pkgs[0].name, "Visual Studio Code");
        assert_eq!(pkgs[0].version, "1.95.3");
        assert_eq!(pkgs[1].id, "Git.Git");
        assert_eq!(pkgs[1].version, "2.47.1");
    }

    #[test]
    fn test_parse_list_output_including_external_apps() {
        let raw = r#"
Name                   Id                                     Version    Available Source
-----------------------------------------------------------------------------------------
Visual Studio Code     Microsoft.VisualStudioCode             1.94.2     1.95.3    winget
Git                    Git.Git                                2.47.0               winget
Custom Local Tool      ARP\Machine\X64\CustomTool_is1         1.2.0
Standalone App         StandaloneNoDotsId                     3.4.1
"#;
        let apps = parse_list_output(raw);
        assert_eq!(apps.len(), 4);
        assert_eq!(apps[0].id, "Microsoft.VisualStudioCode");
        assert!(apps[0].is_winget_managed);
        assert_eq!(apps[0].available_version, Some("1.95.3".to_string()));

        assert_eq!(apps[1].id, "Git.Git");
        assert!(apps[1].is_winget_managed);
        assert_eq!(apps[1].available_version, None);

        assert_eq!(apps[2].id, "ARP\\Machine\\X64\\CustomTool_is1");
        assert!(!apps[2].is_winget_managed);
        assert_eq!(apps[2].source, None);

        assert_eq!(apps[3].id, "StandaloneNoDotsId");
        assert!(!apps[3].is_winget_managed);
    }

    #[test]
    fn test_parse_upgrade_output_ignores_footer() {
        let raw = r#"
Name                   Id                         Version    Available Source
-----------------------------------------------------------------------------
Visual Studio Code     Microsoft.VisualStudioCode 1.94.2     1.95.3    winget
Node.js                OpenJS.NodeJS              20.18.0    20.18.1   winget
2 upgrades available.
"#;
        let upgrades = parse_upgrade_output(raw);
        assert_eq!(upgrades.len(), 2);
        assert_eq!(upgrades[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(upgrades[0].installed_version, "1.94.2");
        assert_eq!(upgrades[0].available_version, "1.95.3");
    }

    #[test]
    fn test_parse_show_output_multiline() {
        let raw = r#"
Found Visual Studio Code [Microsoft.VisualStudioCode]
Version: 1.95.3
Publisher: Microsoft Corporation
Publisher Url: https://www.microsoft.com
Description:
  Code editing redefined.
  Built on open source.
Homepage: https://code.visualstudio.com
License: MIT
License Url: https://code.visualstudio.com/license
Tags:
  editor
  ide
Installer:
  Installer Type: inno
  Installer SHA256: abc123
"#;
        let details = parse_show_output(raw, "Microsoft.VisualStudioCode");
        assert_eq!(details.id, "Microsoft.VisualStudioCode");
        assert_eq!(details.name, "Visual Studio Code");
        assert_eq!(details.version, "1.95.3");
        assert_eq!(details.publisher, "Microsoft Corporation");
        assert_eq!(details.description, "Code editing redefined. Built on open source.");
        assert_eq!(details.license, Some("MIT".to_string()));
        assert_eq!(details.installer_type, Some("inno".to_string()));
        assert_eq!(details.installer_sha256, Some("abc123".to_string()));
        assert_eq!(details.tags, vec!["editor", "ide"]);
    }

    #[test]
    fn test_parse_versions_output() {
        let raw = r#"
Found Visual Studio Code [Microsoft.VisualStudioCode]
Version
-------
1.95.3
1.95.2
1.94.2
"#;
        let versions = parse_versions_output(raw);
        assert_eq!(versions, vec!["1.95.3", "1.95.2", "1.94.2"]);
    }

    #[test]
    fn test_parse_source_list_output() {
        let raw = r#"
Name    Argument                                     Explicit
-------------------------------------------------------------
msstore https://storeedgefd.dsx.mp.microsoft.com/v9.0 false
winget  https://cdn.winget.microsoft.com/cache        false
"#;
        let sources = parse_source_list_output(raw);
        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0].name, "msstore");
        assert!(sources[0].is_official);
        assert_eq!(sources[1].argument, "https://cdn.winget.microsoft.com/cache");
    }
}
