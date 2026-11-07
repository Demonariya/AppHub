use crate::models::{WinGetPackage, WinGetShowDetails, WinGetSource};

/// Parse tabular output from `winget list` or `winget search`
/// Format typically:
/// Name                Id                       Version          Available        Source
/// -------------------------------------------------------------------------------------
/// Visual Studio Code  Microsoft.VisualStudioCode 1.94.2          1.95.3           winget
pub fn parse_search_output(output: &str) -> Vec<WinGetPackage> {
    let mut packages = Vec::new();
    let lines: Vec<&str> = output.lines().collect();

    let mut start_parsing = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Header separator line usually contains dashes
        if trimmed.starts_with("---") || trimmed.contains("-----") {
            start_parsing = true;
            continue;
        }

        if !start_parsing {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 2 {
            // Find package ID which has dot notation
            if let Some(id_idx) = parts.iter().position(|p| p.contains('.')) {
                let id = parts[id_idx].to_string();
                let name = parts[..id_idx].join(" ");
                let version = parts.get(id_idx + 1).unwrap_or(&"1.0.0").to_string();
                let latest_version = parts.get(id_idx + 2).unwrap_or(&version.as_str()).to_string();
                let source = parts.last().unwrap_or(&"winget").to_string();

                packages.push(WinGetPackage {
                    id: id.clone(),
                    name: if name.is_empty() { id.clone() } else { name },
                    publisher: id.split('.').next().unwrap_or("Unknown").to_string(),
                    version: version.clone(),
                    latest_version,
                    description: format!("Package from {}", source),
                    category: "Utilities".to_string(),
                    source,
                    architectures: vec!["x64".to_string()],
                    license: "Open Source".to_string(),
                    homepage: None,
                    is_installed: false,
                    installed_version: None,
                    is_pinned: false,
                });
            }
        }
    }

    packages
}

/// Parses key-value output from `winget show --id <id>`
pub fn parse_show_output(output: &str, package_id: &str) -> WinGetShowDetails {
    let mut name = package_id.to_string();
    let mut publisher = "Unknown Publisher".to_string();
    let mut version = "1.0.0".to_string();
    let mut description = String::new();
    let mut homepage = None;
    let mut license = None;
    let mut installer_sha256 = None;
    let mut installer_type = None;
    let mut tags = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if let Some((key, val)) = trimmed.split_once(':') {
            let k = key.trim().to_lowercase();
            let v = val.trim().to_string();
            match k.as_str() {
                "found" => name = v,
                "publisher" => publisher = v,
                "version" => version = v,
                "description" => description = v,
                "homepage" => homepage = Some(v),
                "license" => license = Some(v),
                "sha256" => installer_sha256 = Some(v),
                "type" => installer_type = Some(v),
                "tags" => tags = v.split(',').map(|s| s.trim().to_string()).collect(),
                _ => {}
            }
        }
    }

    WinGetShowDetails {
        id: package_id.to_string(),
        name,
        publisher,
        version,
        author: None,
        description,
        homepage,
        license,
        license_url: None,
        installer_type,
        installer_sha256,
        architectures: vec!["x64".to_string()],
        tags,
    }
}

/// Parses `winget source list`
pub fn parse_source_list_output(output: &str) -> Vec<WinGetSource> {
    let mut sources = Vec::new();
    let lines: Vec<&str> = output.lines().collect();
    let mut start = false;

    for line in lines {
        let trimmed = line.trim();
        if trimmed.starts_with("---") {
            start = true;
            continue;
        }
        if !start {
            continue;
        }

        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() >= 2 {
            let name = parts[0].to_string();
            let argument = parts[1].to_string();
            let is_official = name == "winget" || name == "msstore";

            sources.push(WinGetSource {
                name,
                argument,
                source_type: "Microsoft.PreIndexed.Package".to_string(),
                is_official,
            });
        }
    }

    sources
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_search_output() {
        let raw = r#"
Name                   Id                         Version    Available Source
-----------------------------------------------------------------------------
Visual Studio Code     Microsoft.VisualStudioCode 1.94.2     1.95.3    winget
Git                    Git.Git                    2.47.0     2.47.1    winget
"#;
        let pkgs = parse_search_output(raw);
        assert_eq!(pkgs.len(), 2);
        assert_eq!(pkgs[0].id, "Microsoft.VisualStudioCode");
        assert_eq!(pkgs[0].name, "Visual Studio Code");
        assert_eq!(pkgs[1].id, "Git.Git");
    }

    #[test]
    fn test_parse_show_output() {
        let raw = r#"
Found: Visual Studio Code [Microsoft.VisualStudioCode]
Version: 1.95.3
Publisher: Microsoft Corporation
Description: Code editing redefined.
Homepage: https://code.visualstudio.com
License: MIT
Type: Inno
"#;
        let details = parse_show_output(raw, "Microsoft.VisualStudioCode");
        assert_eq!(details.id, "Microsoft.VisualStudioCode");
        assert_eq!(details.version, "1.95.3");
        assert_eq!(details.publisher, "Microsoft Corporation");
        assert_eq!(details.license, Some("MIT".to_string()));
    }
}
