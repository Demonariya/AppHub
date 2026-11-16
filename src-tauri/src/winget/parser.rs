use crate::models::{
    WinGetInstalledApp, WinGetPackage, WinGetShowDetails, WinGetSource, WinGetUpgradeInfo,
};

#[derive(Debug, Clone)]
pub struct SearchInspection {
    pub packages: Vec<WinGetPackage>,
    pub agreement_required: bool,
    pub no_results: bool,
    pub is_complete: bool,
    pub truncation_reason: Option<String>,
    pub error_message: Option<String>,
}

/// Strips ANSI CSI (`\x1b[...`), OSC (`\x1b]...(\x07|\x1b\\)`), and two-byte escape sequences from WinGet output.
pub fn strip_ansi_codes(input: &str) -> String {
    if !input.contains('\x1b') && !input.contains('\0') {
        return input.to_string();
    }
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\0' {
            continue;
        }
        if c == '\x1b' {
            match chars.peek().copied() {
                Some('[') => {
                    chars.next();
                    for nc in chars.by_ref() {
                        if ('\x40'..='\x7e').contains(&nc) {
                            break;
                        }
                    }
                }
                Some(']') => {
                    chars.next();
                    while let Some(nc) = chars.next() {
                        if nc == '\x07' {
                            break;
                        }
                        if nc == '\x1b' && chars.peek() == Some(&'\\') {
                            chars.next();
                            break;
                        }
                    }
                }
                Some(nc) if ('\x40'..='\x5f').contains(&nc) => {
                    chars.next();
                }
                _ => {}
            }
            continue;
        }
        out.push(c);
    }
    out
}

fn is_braille_or_spinner_only(s: &str) -> bool {
    let t = s.trim();
    if t.is_empty() {
        return true;
    }
    if matches!(t, "-" | "\\" | "|" | "/") {
        return true;
    }
    if t.starts_with('█') || t.starts_with('▒') || t.starts_with('▓') || t.starts_with('░') {
        return true;
    }
    t.chars()
        .all(|c| ('\u{2800}'..='\u{28ff}').contains(&c) || c == ' ')
}

fn normalize_winget_lines(output: &str) -> Vec<String> {
    let mut lines = Vec::new();
    for raw_line in output.lines() {
        // WinGet writes spinner frames and ANSI cursor clears separated by \r; take the last non-empty clean segment
        let segment = raw_line
            .split('\r')
            .rev()
            .map(strip_ansi_codes)
            .find(|seg| !seg.trim().is_empty())
            .unwrap_or_default();
        let trimmed = segment.trim_end();
        if trimmed.trim().is_empty() || is_braille_or_spinner_only(trimmed) {
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

fn adjust_column_boundaries(chars: &[char], col_defs: &[(String, usize)]) -> Vec<(usize, usize)> {
    let mut bounds: Vec<(usize, usize)> = Vec::with_capacity(col_defs.len());
    let mut prev_end = 0usize;

    for i in 0..col_defs.len() {
        let raw_start = if i == 0 {
            col_defs[i].1.min(chars.len())
        } else {
            prev_end.max(col_defs[i].1).min(chars.len())
        };

        let end = if i + 1 < col_defs.len() {
            let nominal_end = col_defs[i + 1].1.min(chars.len());
            if nominal_end > raw_start
                && nominal_end < chars.len()
                && !chars[nominal_end].is_whitespace()
                && !chars[nominal_end - 1].is_whitespace()
            {
                // Nominal boundary cut mid-token: search nearest whitespace boundary (right up to 8 chars, else left)
                let mut adjusted = nominal_end;
                let right_limit = (nominal_end + 8).min(chars.len());
                let mut found = false;
                for pos in nominal_end..right_limit {
                    if chars[pos].is_whitespace() {
                        adjusted = pos;
                        found = true;
                        break;
                    }
                }
                if !found {
                    let left_limit = nominal_end.saturating_sub(6).max(raw_start);
                    for pos in (left_limit..nominal_end).rev() {
                        if chars[pos].is_whitespace() {
                            adjusted = pos + 1;
                            break;
                        }
                    }
                }
                adjusted
            } else {
                nominal_end
            }
        } else {
            chars.len()
        };

        let clamped_start = raw_start.min(end);
        bounds.push((clamped_start, end));
        prev_end = end;
    }

    bounds
}

fn slice_char_bounds(chars: &[char], start_char: usize, end_char: usize) -> String {
    if start_char >= chars.len() || start_char >= end_char {
        return String::new();
    }
    let end = end_char.min(chars.len());
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
            || lower.contains("more results available")
            || lower.starts_with("<additional entries")
        {
            break;
        }

        let chars: Vec<char> = line.chars().collect();
        let bounds = adjust_column_boundaries(&chars, &col_defs);
        let mut cells = Vec::with_capacity(col_defs.len());
        for (start, end) in bounds {
            cells.push(slice_char_bounds(&chars, start, end));
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

/// Infers a clean AppHub category ONLY when real manifest tags or description clearly match.
/// Returns `None` when uncertain so callers map to `'Uncategorized'` instead of guessing arbitrarily.
pub fn infer_category_from_metadata(tags: &[String], description: Option<&str>) -> Option<String> {
    let mut corpus = String::new();
    for tag in tags {
        corpus.push(' ');
        corpus.push_str(&tag.to_lowercase());
    }
    if let Some(desc) = description {
        corpus.push(' ');
        corpus.push_str(&desc.to_lowercase());
    }
    let text = corpus.trim();
    if text.is_empty() {
        return None;
    }

    let rules: &[(&str, &[&str])] = &[
        ("Browsers", &["web browser", "browser", "chromium", "gecko"]),
        (
            "Development",
            &[
                "ide",
                "compiler",
                "sdk",
                "programming",
                "developer",
                "git",
                "docker",
                "container",
                "code editor",
                "debugger",
                "nodejs",
                "python",
                "rust",
                "typescript",
            ],
        ),
        (
            "Compression",
            &["archiver", "archive", "zip", "unzip", "7z", "rar", "tar", "compression"],
        ),
        (
            "Security",
            &[
                "password",
                "vpn",
                "encryption",
                "antivirus",
                "firewall",
                "security",
                "privacy",
                "2fa",
                "keepass",
            ],
        ),
        (
            "Gaming",
            &["game", "gaming", "launcher", "emulator", "steam", "directx"],
        ),
        (
            "Multimedia",
            &[
                "media player",
                "audio",
                "video",
                "music",
                "codec",
                "ffmpeg",
                "streaming",
                "image editor",
                "photo",
                "3d",
            ],
        ),
        (
            "Communication",
            &["chat", "messaging", "voip", "email", "mail client", "video call", "conferencing"],
        ),
        (
            "Productivity",
            &["notes", "markdown", "office", "spreadsheet", "pdf", "calendar", "todo", "notion"],
        ),
        (
            "Drivers and Hardware Utilities",
            &["driver", "gpu", "peripheral", "firmware", "bios", "keyboard", "mouse utility"],
        ),
        (
            "System Tools",
            &["sysinternals", "benchmark", "monitoring", "disk", "partition", "registry", "diagnostics"],
        ),
        (
            "Utilities",
            &["utility", "clipboard", "screenshot", "window manager", "powertoys", "file manager"],
        ),
    ];

    for (cat, keywords) in rules {
        if keywords.iter().any(|kw| text.contains(kw)) {
            return Some((*cat).to_string());
        }
    }

    None
}

/// Parse tabular output from `winget search` without fabricating missing metadata fields.
pub fn parse_search_output(output: &str) -> Vec<WinGetPackage> {
    parse_search_output_for_source(output, None)
}

pub fn parse_search_output_for_source(
    output: &str,
    default_source: Option<&str>,
) -> Vec<WinGetPackage> {
    let (headers, rows) = parse_table_rows(output);
    let mut packages = Vec::new();

    if headers.is_empty() {
        return packages;
    }

    let name_idx = find_col_index(&headers, &["name", "nombre", "nom"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id", "kennung", "identifiant"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version", "versión"], 2);
    let src_idx = headers
        .iter()
        .position(|h| matches!(h.as_str(), "source" | "quelle" | "origen"));
    let now = chrono::Utc::now().timestamp_millis();

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
            .or_else(|| default_source.map(|s| s.to_string()))
            .unwrap_or_else(|| "winget".to_string());

        let is_official_source = source.eq_ignore_ascii_case("winget")
            || source.eq_ignore_ascii_case("msstore");

        packages.push(WinGetPackage {
            id: id.clone(),
            name: if name.is_empty() { id } else { name },
            publisher: None,
            author: None,
            version: version.clone(),
            latest_version: version,
            description: None,
            category: None,
            source,
            tags: Vec::new(),
            architectures: Vec::new(),
            license: None,
            license_url: None,
            homepage: None,
            publisher_url: None,
            release_date: None,
            release_notes: None,
            installer_type: None,
            installer_url: None,
            installer_sha256: None,
            download_size_bytes: None,
            installed_size_bytes: None,
            verified: is_official_source,
            metadata_status: "summary".to_string(),
            is_available: true,
            last_observed_at: now,
            last_metadata_refresh_at: None,
            is_installed: false,
            installed_version: None,
            is_pinned: false,
        });
    }

    packages
}

/// Inspects full stdout/stderr and exit code from `winget search --query "" --source <source>`
/// to accurately surface source agreement prompts, truncation/limit conditions, empty results, or errors.
pub fn inspect_search_result(
    stdout: &str,
    stderr: &str,
    exit_code: i32,
    success: bool,
    source_name: &str,
) -> SearchInspection {
    let combined = format!("{}\n{}", stdout, stderr);
    let lower = combined.to_lowercase();

    // 0x8a150044 (-1978335164) = WINGET_CLI_ERROR_SOURCE_AGREEMENTS_NOT_ACCEPTED
    let agreement_required = lower.contains("source agreements")
        || lower.contains("do you agree to all the source agreements")
        || lower.contains("accept-source-agreements")
        || exit_code == -1978335164;

    if agreement_required {
        return SearchInspection {
            packages: Vec::new(),
            agreement_required: true,
            no_results: false,
            is_complete: false,
            truncation_reason: None,
            error_message: Some(format!(
                "WinGet source '{}' requires accepting source agreements before it can be queried.",
                source_name
            )),
        };
    }

    let no_results = lower.contains("no package found")
        || lower.contains("no packages found")
        || lower.contains("no se encontró ningún paquete")
        || lower.contains("es wurde kein paket gefunden")
        || lower.contains("aucun package trouvé");

    let packages = parse_search_output_for_source(stdout, Some(source_name));

    if no_results && packages.is_empty() {
        return SearchInspection {
            packages,
            agreement_required: false,
            no_results: true,
            is_complete: true,
            truncation_reason: None,
            error_message: None,
        };
    }

    // Detect WinGet CLI or source truncation warnings honestly
    let has_truncation_marker = lower.contains("more results")
        || lower.contains("additional entries")
        || lower.contains("truncated")
        || lower.contains("max results");

    let hit_cli_row_cap = packages.len() >= 1000
        && (source_name.eq_ignore_ascii_case("msstore") || has_truncation_marker);

    let (is_complete, truncation_reason) = if has_truncation_marker {
        (
            false,
            Some(format!(
                "WinGet reported truncated output for source '{}'; {} packages indexed. Use live search for specific uncached queries.",
                source_name,
                packages.len()
            )),
        )
    } else if hit_cli_row_cap {
        (
            false,
            Some(format!(
                "Source '{}' returned {} packages (CLI/REST page cap threshold reached). Additional packages can still be queried via live search.",
                source_name,
                packages.len()
            )),
        )
    } else if !success && packages.is_empty() {
        (false, None)
    } else {
        (true, None)
    };

    let error_message = if !success && packages.is_empty() && !no_results {
        let msg = if !stderr.trim().is_empty() {
            stderr.trim().to_string()
        } else if !stdout.trim().is_empty() {
            stdout.trim().to_string()
        } else {
            format!(
                "winget search for source '{}' failed with exit code {}",
                source_name, exit_code
            )
        };
        Some(msg)
    } else {
        None
    };

    SearchInspection {
        packages,
        agreement_required: false,
        no_results,
        is_complete,
        truncation_reason,
        error_message,
    }
}

/// Parse tabular output from `winget list`
pub fn parse_list_output(output: &str) -> Vec<WinGetInstalledApp> {
    let (headers, rows) = parse_table_rows(output);
    let mut apps = Vec::new();

    if headers.is_empty() {
        return apps;
    }

    let name_idx = find_col_index(&headers, &["name", "nombre", "nom"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id", "kennung", "identifiant"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version", "versión"], 2);
    let avail_idx = headers
        .iter()
        .position(|h| matches!(h.as_str(), "available" | "disponible" | "verfügbar"));
    let src_idx = headers
        .iter()
        .position(|h| matches!(h.as_str(), "source" | "quelle" | "origen"));

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
            installed_size_bytes: None,
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

    let name_idx = find_col_index(&headers, &["name", "nombre", "nom"], 0).unwrap_or(0);
    let id_idx = find_col_index(&headers, &["id", "kennung", "identifiant"], 1).unwrap_or(1);
    let ver_idx = find_col_index(&headers, &["version", "versión"], 2);
    let avail_idx = find_col_index(&headers, &["available", "disponible", "verfügbar"], 3);
    let src_idx = headers
        .iter()
        .position(|h| matches!(h.as_str(), "source" | "quelle" | "origen"));

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

fn parse_human_size_to_bytes(raw: &str) -> Option<u64> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut parts = trimmed.split_whitespace();
    let num_str = parts.next()?.replace(',', "");
    let value: f64 = num_str.parse().ok()?;
    if value <= 0.0 || !value.is_finite() {
        return None;
    }
    let unit = parts.next().unwrap_or("B").to_ascii_lowercase();
    let multiplier = match unit.as_str() {
        "b" | "byte" | "bytes" => 1.0,
        "kb" | "kib" => 1024.0,
        "mb" | "mib" => 1024.0 * 1024.0,
        "gb" | "gib" => 1024.0 * 1024.0 * 1024.0,
        "tb" | "tib" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((value * multiplier).round() as u64)
}

/// Parses key-value & multi-line output from `winget show --id <id>`
pub fn parse_show_output(output: &str, package_id: &str) -> WinGetShowDetails {
    let mut name = package_id.to_string();
    let mut publisher: Option<String> = None;
    let mut version = "Unknown".to_string();
    let mut author = None;
    let mut description_acc = String::new();
    let mut homepage = None;
    let mut publisher_url = None;
    let mut license = None;
    let mut license_url = None;
    let mut release_date = None;
    let mut release_notes = None;
    let mut installer_sha256 = None;
    let mut installer_type = None;
    let mut installer_url = None;
    let mut download_size_bytes = None;
    let mut architectures: Vec<String> = Vec::new();
    let mut tags: Vec<String> = Vec::new();
    let mut active_block: Option<String> = None;

    for raw_line in output.lines() {
        let cleaned = raw_line
            .split('\r')
            .rev()
            .map(strip_ansi_codes)
            .find(|seg| !seg.trim().is_empty())
            .unwrap_or_default();
        let line = cleaned.as_str();
        if line.trim().is_empty() || is_braille_or_spinner_only(line) {
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
            let k = key.trim().to_lowercase();
            let v = val.trim().to_string();

            if is_indented && k.starts_with("http") && active_block.as_deref() == Some("description")
            {
                if !description_acc.is_empty() {
                    description_acc.push(' ');
                }
                description_acc.push_str(trimmed);
                continue;
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
                        publisher = Some(v);
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
                        description_acc = v;
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
                "architecture" => {
                    if !v.is_empty() {
                        let arch = v.to_lowercase();
                        if !architectures.contains(&arch) {
                            architectures.push(arch);
                        }
                    }
                }
                "download url" | "installer url" => {
                    if !v.is_empty() {
                        installer_url = Some(v);
                    }
                }
                "size" | "installer size" | "download size" => {
                    if let Some(bytes) = parse_human_size_to_bytes(&v) {
                        download_size_bytes = Some(bytes);
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
                    if !description_acc.is_empty() {
                        description_acc.push(' ');
                    }
                    description_acc.push_str(trimmed);
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

    let description = if description_acc.trim().is_empty() {
        None
    } else {
        Some(description_acc)
    };

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
        download_size_bytes,
        architectures,
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
    let type_idx = headers.iter().position(|h| h == "type");

    for row in rows {
        let name = row.get(name_idx).cloned().unwrap_or_default();
        let argument = row.get(arg_idx).cloned().unwrap_or_default();
        if name.is_empty() {
            continue;
        }
        let is_official = name == "winget" || name == "msstore";
        let source_type = type_idx
            .and_then(|i| row.get(i))
            .cloned()
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| {
                if name == "msstore" {
                    "Microsoft.Rest".to_string()
                } else {
                    "Microsoft.PreIndexed.Package".to_string()
                }
            });

        sources.push(WinGetSource {
            name,
            argument,
            source_type,
            is_official,
        });
    }

    sources
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_output_with_spinner_no_fabrication() {
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
        assert_eq!(pkgs[0].publisher, None);
        assert_eq!(pkgs[0].description, None);
        assert_eq!(pkgs[0].category, None);
        assert_eq!(pkgs[0].license, None);
        assert!(pkgs[0].architectures.is_empty());
        assert_eq!(pkgs[0].metadata_status, "summary");
        assert!(pkgs[0].verified);
        assert_eq!(pkgs[1].id, "Git.Git");
        assert_eq!(pkgs[1].version, "2.47.1");
    }

    #[test]
    fn test_inspect_search_result_detects_agreements_and_truncation() {
        let agreement_out = "The `msstore` source requires that you view the following agreements before using.\nDo you agree to all the source agreements terms?";
        let insp1 = inspect_search_result(agreement_out, "", -1978335164, false, "msstore");
        assert!(insp1.agreement_required);
        assert!(!insp1.is_complete);

        let truncated_out = "Name  Id  Version\n-----------------\nFoo   Foo.Bar 1.0.0\n<additional entries found, truncated>";
        let insp2 = inspect_search_result(truncated_out, "", 0, true, "custom-rest");
        assert_eq!(insp2.packages.len(), 1);
        assert!(!insp2.is_complete);
        assert!(insp2.truncation_reason.is_some());

        let empty_out = "No package found matching input criteria.";
        let insp3 = inspect_search_result(empty_out, "", -1978335212, false, "custom");
        assert!(insp3.no_results);
        assert!(insp3.is_complete);
        assert!(insp3.error_message.is_none());
    }

    #[test]
    fn test_infer_category_honest() {
        assert_eq!(
            infer_category_from_metadata(&["browser".to_string(), "web".to_string()], None),
            Some("Browsers".to_string())
        );
        assert_eq!(
            infer_category_from_metadata(&[], Some("A lightweight code editor for developers")),
            Some("Development".to_string())
        );
        assert_eq!(infer_category_from_metadata(&[], None), None);
        assert_eq!(infer_category_from_metadata(&["randomtag".to_string()], Some("Acme tool")), None);
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
  Architecture: x64
  Installer SHA256: abc123
  Installer Size: 98.4 MB
"#;
        let details = parse_show_output(raw, "Microsoft.VisualStudioCode");
        assert_eq!(details.id, "Microsoft.VisualStudioCode");
        assert_eq!(details.name, "Visual Studio Code");
        assert_eq!(details.version, "1.95.3");
        assert_eq!(details.publisher, Some("Microsoft Corporation".to_string()));
        assert_eq!(
            details.description,
            Some("Code editing redefined. Built on open source.".to_string())
        );
        assert_eq!(details.license, Some("MIT".to_string()));
        assert_eq!(details.installer_type, Some("inno".to_string()));
        assert_eq!(details.architectures, vec!["x64"]);
        assert_eq!(details.installer_sha256, Some("abc123".to_string()));
        assert!(details.download_size_bytes.is_some());
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
        assert_eq!(sources[0].source_type, "Microsoft.Rest");
        assert_eq!(sources[1].argument, "https://cdn.winget.microsoft.com/cache");
    }

    #[test]
    fn test_parse_table_with_unicode_localized_headers_and_overflow() {
        let raw = "\
Nombre                 Kennung                 Versión   Quelle\r
-----------------------------------------------------------------\r
Zen – Fast Browser     Zen-Team.Zen-Browser    1.0.2     winget\r
µTorrent Classic       BitTorrent.uTorrent.Pro 3.6.0     winget\r
";
        let pkgs = parse_search_output(raw);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].name, "Zen – Fast Browser");
        assert_eq!(pkgs[0].id, "Zen-Team.Zen-Browser");
        assert_eq!(pkgs[0].source, "winget");
        assert_eq!(pkgs[1].id, "BitTorrent.uTorrent.Pro");
        assert_eq!(pkgs[1].version, "3.6.0");

        let no_source_raw = "\
Name            Id               Version\n\
----------------------------------------\n\
7-Zip           7zip.7zip        24.09\n";
        let single_src = parse_search_output_for_source(no_source_raw, Some("winget"));
        assert_eq!(single_src.len(), 1);
        assert_eq!(single_src[0].id, "7zip.7zip");
        assert_eq!(single_src[0].source, "winget");
    }

    #[test]
    fn test_strip_ansi_and_parse_winget_1_29_output_with_msstore_and_multi_source() {
        let raw = "\x1b[?25l\r⠋\r\x1b[KName                            Id                              Version   Source\r\n\
-------------------------------------------------------------------------------------\r\n\
\x1b[32m7-Zip\x1b[0m                           7zip.7zip                       24.09     winget\r\n\
AdGuard                         AdGuard.AdGuard                 7.19.0    winget\r\n\
App Installer                   Microsoft.DesktopAppInstaller   1.29.380  winget\r\n\
App Installer                   9NBLGGH4NNS1                    Unknown   msstore\r\n\
\x1b[?25h";
        let pkgs = parse_search_output(raw);
        assert_eq!(pkgs.len(), 4);
        assert_eq!(pkgs[0].id, "7zip.7zip");
        assert_eq!(pkgs[0].name, "7-Zip");
        assert_eq!(pkgs[1].id, "AdGuard.AdGuard");
        assert_eq!(pkgs[2].id, "Microsoft.DesktopAppInstaller");
        assert_eq!(pkgs[2].version, "1.29.380");
        assert_eq!(pkgs[3].id, "9NBLGGH4NNS1");
        assert_eq!(pkgs[3].source, "msstore");

        let ansi_show = "\x1b[?25l\r⠙\r\x1b[K\x1b[1mFound 7-Zip [7zip.7zip]\x1b[0m\r\n\
Version: 24.09\r\n\
Publisher: Igor Pavlov\r\n\
Homepage: https://www.7-zip.org/\r\n";
        let details = parse_show_output(ansi_show, "7zip.7zip");
        assert_eq!(details.name, "7-Zip");
        assert_eq!(details.version, "24.09");
        assert_eq!(details.publisher.as_deref(), Some("Igor Pavlov"));
        assert_eq!(details.homepage.as_deref(), Some("https://www.7-zip.org/"));
    }
}
