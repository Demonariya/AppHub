use crate::database::DatabaseManager;
use crate::errors::AppHubError;
use crate::models::{IconCacheRecord, IconResolveResponse};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tokio::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const MAX_ICON_BYTES: usize = 2 * 1024 * 1024; // 2 MiB max
const VERIFIED_TTL_MS: i64 = 7 * 24 * 60 * 60 * 1000; // 7 days
const FAILED_RETRY_TTL_MS: i64 = 15 * 60 * 1000; // 15 minutes

pub fn build_icon_cache_key(package_id: &str, source: Option<&str>) -> String {
    let src = source
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("winget")
        .to_lowercase();
    format!("{}::{}", src, package_id.trim().to_lowercase())
}

pub fn get_icons_cache_dir() -> PathBuf {
    if let Ok(app_data) = std::env::var("APPDATA") {
        let dir = PathBuf::from(app_data).join("AppHub").join("icons");
        let _ = fs::create_dir_all(&dir);
        dir
    } else {
        let dir = std::env::temp_dir().join("apphub-icons");
        let _ = fs::create_dir_all(&dir);
        dir
    }
}

/// Validates a remote icon URL against unsafe schemes, control characters,
/// known dead WinGet asset URLs, and generic portal favicons.
pub fn is_safe_icon_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim();
    if trimmed.is_empty() || trimmed.len() > 2048 {
        return Err("Icon URL is empty or exceeds maximum length".to_string());
    }
    if trimmed.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("Icon URL contains invalid whitespace or control characters".to_string());
    }
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("Only HTTP(S) icon URLs may be fetched remotely".to_string());
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.contains("github.com/microsoft/winget-pkgs/")
        || lower.contains("raw.githubusercontent.com/microsoft/winget-pkgs/")
    {
        return Err("Blocked unreliable winget-pkgs asset path".to_string());
    }
    if lower.contains("microsoft.com/favicon.ico")
        || lower.contains("www.microsoft.com/favicon")
        || lower.contains("live.com/favicon")
        || lower.contains("msn.com/favicon")
    {
        return Err("Blocked generic portal favicon URL".to_string());
    }
    Ok(trimmed.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedImageMeta {
    pub mime_type: String,
    pub ext: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

/// Validates magic bytes, rejects HTML error pages / unsafe SVGs, and extracts dimensions.
pub fn validate_image_payload(
    bytes: &[u8],
    header_content_type: Option<&str>,
) -> Result<ValidatedImageMeta, String> {
    if bytes.len() < 32 {
        return Err("Downloaded payload is too small to be a valid icon".to_string());
    }
    if bytes.len() > MAX_ICON_BYTES {
        return Err("Downloaded icon exceeds 2 MiB size limit".to_string());
    }

    if let Some(ct) = header_content_type {
        let lower_ct = ct.to_ascii_lowercase();
        if lower_ct.contains("text/html")
            || lower_ct.contains("application/xhtml")
            || lower_ct.contains("application/json")
            || lower_ct.contains("text/plain")
        {
            return Err(format!("Server returned non-image Content-Type: {}", ct));
        }
    }

    // Sniff leading text for HTML error pages returned with HTTP 200
    let prefix_len = bytes.len().min(512);
    let prefix_lower = String::from_utf8_lossy(&bytes[..prefix_len])
        .trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
        .to_ascii_lowercase();

    if prefix_lower.starts_with("<!doctype html")
        || prefix_lower.starts_with("<html")
        || prefix_lower.starts_with("<head")
        || prefix_lower.starts_with("<body")
    {
        return Err("Rejected HTML document returned instead of image".to_string());
    }

    // 1. PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR
    if bytes.len() >= 24 && bytes[0..8] == [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] {
        let width = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let height = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        if width < 16 || height < 16 || width > 4096 || height > 4096 {
            return Err(format!("PNG dimensions {}x{} out of acceptable icon range", width, height));
        }
        return Ok(ValidatedImageMeta {
            mime_type: "image/png".to_string(),
            ext: "png".to_string(),
            width: Some(width),
            height: Some(height),
        });
    }

    // 2. ICO: 00 00 01 00 + count + entries
    if bytes.len() >= 22 && bytes[0..4] == [0x00, 0x00, 0x01, 0x00] {
        let count = u16::from_le_bytes([bytes[4], bytes[5]]) as usize;
        if count == 0 || count > 64 {
            return Err("Invalid ICO directory entry count".to_string());
        }
        let mut max_w = 0u32;
        let mut max_h = 0u32;
        for i in 0..count {
            let offset = 6 + i * 16;
            if offset + 2 > bytes.len() {
                break;
            }
            let w = if bytes[offset] == 0 { 256 } else { bytes[offset] as u32 };
            let h = if bytes[offset + 1] == 0 { 256 } else { bytes[offset + 1] as u32 };
            max_w = max_w.max(w);
            max_h = max_h.max(h);
        }
        if max_w < 16 || max_h < 16 {
            return Err("ICO resolution is below 16x16 minimum".to_string());
        }
        return Ok(ValidatedImageMeta {
            mime_type: "image/x-icon".to_string(),
            ext: "ico".to_string(),
            width: Some(max_w),
            height: Some(max_h),
        });
    }

    // 3. JPEG: FF D8 FF ... SOFn
    if bytes.len() >= 12 && bytes[0..3] == [0xFF, 0xD8, 0xFF] {
        let (w, h) = parse_jpeg_dimensions(bytes).unwrap_or((0, 0));
        if w != 0 && (w < 16 || h < 16 || w > 4096 || h > 4096) {
            return Err(format!("JPEG dimensions {}x{} out of acceptable icon range", w, h));
        }
        return Ok(ValidatedImageMeta {
            mime_type: "image/jpeg".to_string(),
            ext: "jpg".to_string(),
            width: if w > 0 { Some(w) } else { None },
            height: if h > 0 { Some(h) } else { None },
        });
    }

    // 4. WEBP: RIFF....WEBP
    if bytes.len() >= 16 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Ok(ValidatedImageMeta {
            mime_type: "image/webp".to_string(),
            ext: "webp".to_string(),
            width: None,
            height: None,
        });
    }

    // 5. SVG: XML / <svg ... </svg>, sanitized against scripts/event handlers
    if prefix_lower.contains("<svg") {
        let full_text = std::str::from_utf8(bytes)
            .map_err(|_| "SVG icon is not valid UTF-8".to_string())?;
        let lower_full = full_text.to_ascii_lowercase();
        if !lower_full.contains("</svg>") {
            return Err("Incomplete SVG payload missing closing </svg> tag".to_string());
        }
        if lower_full.contains("<script")
            || lower_full.contains("javascript:")
            || lower_full.contains("<foreignobject")
            || lower_full.contains("onload=")
            || lower_full.contains("onerror=")
        {
            return Err("Rejected SVG containing unsafe scripting elements".to_string());
        }
        return Ok(ValidatedImageMeta {
            mime_type: "image/svg+xml".to_string(),
            ext: "svg".to_string(),
            width: Some(64),
            height: Some(64),
        });
    }

    Err("Unrecognized or unsupported image format".to_string())
}

fn parse_jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    let mut i = 2usize;
    while i + 8 < bytes.len() {
        if bytes[i] != 0xFF {
            i += 1;
            continue;
        }
        let marker = bytes[i + 1];
        if marker == 0xD8 || marker == 0xD9 || marker == 0x00 || (0xD0..=0xD7).contains(&marker) {
            i += 2;
            continue;
        }
        if i + 4 >= bytes.len() {
            break;
        }
        let seg_len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        if seg_len < 2 {
            break;
        }
        if (marker == 0xC0 || marker == 0xC1 || marker == 0xC2) && i + 8 < bytes.len() {
            let h = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
            let w = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
            return Some((w, h));
        }
        i += 2 + seg_len;
    }
    None
}

/// Pure-Rust SHA-256 hex digest (avoids adding external Cargo dependencies)
pub fn sha256_hex(data: &[u8]) -> String {
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut msg = Vec::with_capacity(data.len() + 72);
    msg.extend_from_slice(data);
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 64];
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16]
                .wrapping_add(s0)
                .wrapping_add(w[i - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = String::with_capacity(64);
    for word in h {
        out.push_str(&format!("{:08x}", word));
    }
    out
}

/// Pure-Rust RFC 4648 Base64 encoder for converting cached icon bytes into Data URIs
pub fn base64_encode(input: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };

        out.push(TABLE[(b0 >> 2) & 0x3F] as char);
        out.push(TABLE[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0F)] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((b1 & 0x0F) << 2) | ((b2 >> 6) & 0x03)] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[b2 & 0x3F] as char);
        } else {
            out.push('=');
        }
    }
    out
}

fn parse_final_http_status_and_content_type(headers: &[u8]) -> (Option<u16>, Option<String>) {
    let text = String::from_utf8_lossy(headers);
    let mut last_status: Option<u16> = None;
    let mut last_ct: Option<String> = None;
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.to_ascii_uppercase().starts_with("HTTP/") {
            if let Some(code_str) = trimmed.split_whitespace().nth(1) {
                if let Ok(code) = code_str.parse::<u16>() {
                    last_status = Some(code);
                    last_ct = None;
                }
            }
        } else if let Some((name, val)) = trimmed.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-type") {
                last_ct = Some(val.trim().to_string());
            }
        }
    }
    (last_status, last_ct)
}

async fn download_remote_icon_bytes(
    url: &str,
) -> Result<(Vec<u8>, Option<String>), String> {
    let safe_url = is_safe_icon_url(url)?;
    let curl_bin = if cfg!(windows) { "curl.exe" } else { "curl" };
    let temp_header_path = std::env::temp_dir().join(format!(
        "apphub_icon_hdr_{}_{}.tmp",
        std::process::id(),
        chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0)
    ));
    let header_path_str = temp_header_path.to_string_lossy().to_string();

    let mut cmd = Command::new(curl_bin);
    cmd.args([
        "-s",
        "-S",
        "-L",
        "--max-redirs",
        "5",
        "--max-time",
        "6",
        "--max-filesize",
        &MAX_ICON_BYTES.to_string(),
        "-D",
        &header_path_str,
        "-A",
        "AppHub/1.0 IconVerifier",
        "--",
        &safe_url,
    ])
    .kill_on_drop(true)
    .stdin(Stdio::null())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn curl for icon fetch: {}", e))?;

    let output = tokio::time::timeout(Duration::from_secs(7), child.wait_with_output())
        .await
        .map_err(|_| "Icon download timed out".to_string())?
        .map_err(|e| format!("Icon download I/O error: {}", e))?;

    let header_bytes = fs::read(&temp_header_path).unwrap_or_default();
    let _ = fs::remove_file(&temp_header_path);

    if !output.status.success() {
        let stderr_msg = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr_msg.is_empty() {
            format!("curl exited with status {:?}", output.status.code())
        } else {
            stderr_msg
        });
    }

    let (status_code, content_type) = parse_final_http_status_and_content_type(&header_bytes);
    if let Some(code) = status_code {
        if !(200..300).contains(&code) {
            return Err(format!("HTTP {} returned by icon host", code));
        }
    }

    Ok((output.stdout, content_type))
}

pub async fn resolve_and_cache_icon_impl(
    db: &DatabaseManager,
    cache_dir: &Path,
    package_id: &str,
    source: Option<&str>,
    source_type: &str,
    candidate_urls: &[String],
    force_refresh: bool,
) -> Result<IconResolveResponse, AppHubError> {
    let src_norm = source
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("winget")
        .to_string();
    let cache_key = build_icon_cache_key(package_id, Some(&src_norm));
    let now = chrono::Utc::now().timestamp_millis();

    if !force_refresh {
        if let Ok(Some(cached)) = db.get_cached_icon(&cache_key) {
            if cached.expires_at > now {
                if cached.verified {
                    if let (Some(ref path_str), Some(ref mime)) =
                        (&cached.local_path, &cached.mime_type)
                    {
                        if let Ok(bytes) = fs::read(path_str) {
                            if !bytes.is_empty() {
                                let data_uri =
                                    format!("data:{};base64,{}", mime, base64_encode(&bytes));
                                return Ok(IconResolveResponse {
                                    cache_key: cached.cache_key,
                                    package_id: cached.package_id,
                                    source: cached.source,
                                    source_type: cached.source_type,
                                    resolved_url: cached.resolved_url,
                                    data_uri: Some(data_uri),
                                    mime_type: cached.mime_type,
                                    sha256: cached.sha256,
                                    width: cached.width,
                                    height: cached.height,
                                    status: "verified".to_string(),
                                    error_message: None,
                                    fetched_at: cached.fetched_at,
                                    expires_at: cached.expires_at,
                                    verified: true,
                                    from_cache: true,
                                });
                            }
                        }
                    }
                } else {
                    return Ok(IconResolveResponse {
                        cache_key: cached.cache_key,
                        package_id: cached.package_id,
                        source: cached.source,
                        source_type: cached.source_type,
                        resolved_url: cached.resolved_url,
                        data_uri: None,
                        mime_type: None,
                        sha256: None,
                        width: None,
                        height: None,
                        status: "failed".to_string(),
                        error_message: cached.error_message,
                        fetched_at: cached.fetched_at,
                        expires_at: cached.expires_at,
                        verified: false,
                        from_cache: true,
                    });
                }
            }
        }
    }

    let mut last_error = "No valid candidate icon URLs provided".to_string();
    let mut attempted_url: Option<String> = None;

    for candidate in candidate_urls {
        let trimmed = candidate.trim();
        if trimmed.is_empty() {
            continue;
        }
        attempted_url = Some(trimmed.to_string());
        match download_remote_icon_bytes(trimmed).await {
            Ok((bytes, ct)) => match validate_image_payload(&bytes, ct.as_deref()) {
                Ok(meta) => {
                    let hash = sha256_hex(&bytes);
                    let _ = fs::create_dir_all(cache_dir);
                    let file_path = cache_dir.join(format!("{}.{}", hash, meta.ext));
                    if let Err(e) = fs::write(&file_path, &bytes) {
                        last_error = format!("Failed to persist cached icon file: {}", e);
                        continue;
                    }
                    let local_path_str = file_path.to_string_lossy().to_string();
                    let expires_at = now + VERIFIED_TTL_MS;
                    let rec = IconCacheRecord {
                        cache_key: cache_key.clone(),
                        package_id: package_id.to_string(),
                        source: src_norm.clone(),
                        source_type: source_type.to_string(),
                        resolved_url: Some(trimmed.to_string()),
                        local_path: Some(local_path_str),
                        mime_type: Some(meta.mime_type.clone()),
                        sha256: Some(hash.clone()),
                        width: meta.width,
                        height: meta.height,
                        status: "verified".to_string(),
                        error_message: None,
                        fetched_at: now,
                        expires_at,
                        verified: true,
                    };
                    let _ = db.upsert_cached_icon(&rec);

                    let data_uri =
                        format!("data:{};base64,{}", meta.mime_type, base64_encode(&bytes));
                    return Ok(IconResolveResponse {
                        cache_key,
                        package_id: package_id.to_string(),
                        source: src_norm,
                        source_type: source_type.to_string(),
                        resolved_url: Some(trimmed.to_string()),
                        data_uri: Some(data_uri),
                        mime_type: Some(meta.mime_type),
                        sha256: Some(hash),
                        width: meta.width,
                        height: meta.height,
                        status: "verified".to_string(),
                        error_message: None,
                        fetched_at: now,
                        expires_at,
                        verified: true,
                        from_cache: false,
                    });
                }
                Err(err_msg) => {
                    last_error = err_msg;
                }
            },
            Err(err_msg) => {
                last_error = err_msg;
            }
        }
    }

    // Record failure with SHORT retry TTL (15m) — never permanently cache a neutral placeholder!
    let expires_at = now + FAILED_RETRY_TTL_MS;
    let fail_rec = IconCacheRecord {
        cache_key: cache_key.clone(),
        package_id: package_id.to_string(),
        source: src_norm.clone(),
        source_type: source_type.to_string(),
        resolved_url: attempted_url.clone(),
        local_path: None,
        mime_type: None,
        sha256: None,
        width: None,
        height: None,
        status: "failed".to_string(),
        error_message: Some(last_error.clone()),
        fetched_at: now,
        expires_at,
        verified: false,
    };
    let _ = db.upsert_cached_icon(&fail_rec);

    Ok(IconResolveResponse {
        cache_key,
        package_id: package_id.to_string(),
        source: src_norm,
        source_type: source_type.to_string(),
        resolved_url: attempted_url,
        data_uri: None,
        mime_type: None,
        sha256: None,
        width: None,
        height: None,
        status: "failed".to_string(),
        error_message: Some(last_error),
        fetched_at: now,
        expires_at,
        verified: false,
        from_cache: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_icon_url_rejects_unreliable_paths_and_portals() {
        assert!(is_safe_icon_url("https://code.visualstudio.com/assets/images/code-stable.png").is_ok());
        assert!(is_safe_icon_url("https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/foo.png").is_err());
        assert!(is_safe_icon_url("https://www.microsoft.com/favicon.ico").is_err());
        assert!(is_safe_icon_url("javascript:alert(1)").is_err());
        assert!(is_safe_icon_url("https://example.com/bad url.png").is_err());
    }

    #[test]
    fn test_validate_image_payload_png_and_rejects_html() {
        let mut png = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        png.extend_from_slice(&[0x00, 0x00, 0x00, 0x0D]); // length
        png.extend_from_slice(b"IHDR");
        png.extend_from_slice(&64u32.to_be_bytes());
        png.extend_from_slice(&64u32.to_be_bytes());
        png.extend_from_slice(&[8, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
        let meta = validate_image_payload(&png, Some("image/png")).expect("valid 64x64 png");
        assert_eq!(meta.mime_type, "image/png");
        assert_eq!(meta.width, Some(64));
        assert_eq!(meta.height, Some(64));

        let html = b"<!DOCTYPE html><html><head><title>404</title></head><body>Not found</body></html>";
        assert!(validate_image_payload(html, Some("image/png")).is_err());
    }

    #[test]
    fn test_validate_image_payload_ico_and_svg_sanitization() {
        let mut ico = vec![0x00, 0x00, 0x01, 0x00, 0x01, 0x00]; // 1 image
        ico.push(64); // width
        ico.push(64); // height
        ico.extend_from_slice(&[0u8; 32]);
        let ico_meta = validate_image_payload(&ico, Some("image/x-icon")).expect("valid 64x64 ico");
        assert_eq!(ico_meta.mime_type, "image/x-icon");
        assert_eq!(ico_meta.width, Some(64));

        let safe_svg = br#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"/></svg>"#;
        assert!(validate_image_payload(safe_svg, Some("image/svg+xml")).is_ok());

        let unsafe_svg = br#"<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>"#;
        assert!(validate_image_payload(unsafe_svg, Some("image/svg+xml")).is_err());
    }

    #[test]
    fn test_sha256_and_base64_vectors() {
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(base64_encode(b"Man"), "TWFu");
        assert_eq!(base64_encode(b"Ma"), "TWE=");
        assert_eq!(base64_encode(b"M"), "TQ==");
    }
}
