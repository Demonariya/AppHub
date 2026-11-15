/**
 * Validates icon URLs, MIME types, magic bytes, and image payloads.
 * Protects against 404s, HTML error pages, zero-byte assets, and generic fallback leaks.
 */

const PROHIBITED_SUBSTRINGS = [
  'raw.githubusercontent.com/microsoft/winget-pkgs',
  'github.com/microsoft/winget-pkgs/',
];

const GENERIC_PORTAL_FAVICONS = [
  'microsoft.com/favicon.ico',
  'www.microsoft.com/favicon',
  'live.com/favicon',
  'msn.com/favicon',
  'bing.com/favicon',
];

/**
 * Synchronously checks if a candidate icon URL is well-formed and safe.
 */
export function isValidIconUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;

  // Accept data URIs for inline SVGs/images
  if (
    trimmed.startsWith('data:image/svg+xml') ||
    trimmed.startsWith('data:image/png') ||
    trimmed.startsWith('data:image/webp') ||
    trimmed.startsWith('data:image/x-icon') ||
    trimmed.startsWith('data:image/jpeg')
  ) {
    return trimmed.length > 30;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const lower = trimmed.toLowerCase();
    for (const bad of PROHIBITED_SUBSTRINGS) {
      if (lower.includes(bad)) {
        return false;
      }
    }

    for (const portalFavicon of GENERIC_PORTAL_FAVICONS) {
      if (lower.includes(portalFavicon)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a given URL is a prohibited generic favicon fallback
 * or personal avatar unrelated to official product branding.
 */
export function isGenericFaviconLeak(url: string, packageId: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const lowerPkg = (packageId || '').toLowerCase();

  for (const portalFavicon of GENERIC_PORTAL_FAVICONS) {
    if (lowerUrl.includes(portalFavicon)) {
      return true;
    }
  }

  // If URL targets microsoft.com portal but the package is NOT a Microsoft package
  if (
    (lowerUrl.includes('microsoft.com') || lowerUrl.includes('learn.microsoft.com')) &&
    !lowerPkg.startsWith('microsoft.') &&
    !lowerPkg.startsWith('markrussinovich.')
  ) {
    return true;
  }

  return false;
}

/**
 * Inspects downloaded bytes for valid image signatures and rejects HTML error pages.
 */
export function validateImageBytes(
  bytes: Uint8Array,
  contentType?: string | null
): { valid: boolean; mimeType?: string; error?: string } {
  if (bytes.byteLength < 32) {
    return { valid: false, error: 'Image payload too small (< 32 bytes)' };
  }

  const ct = (contentType || '').toLowerCase();
  if (
    ct.includes('text/html') ||
    ct.includes('application/xhtml') ||
    ct.includes('application/json') ||
    ct.includes('text/plain')
  ) {
    return { valid: false, error: `Non-image Content-Type: ${contentType}` };
  }

  const prefixText = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(0, Math.min(bytes.byteLength, 256)))
    .trimStart()
    .toLowerCase();

  if (
    prefixText.startsWith('<!doctype html') ||
    prefixText.startsWith('<html') ||
    prefixText.startsWith('<head') ||
    prefixText.startsWith('<body')
  ) {
    return { valid: false, error: 'Rejected HTML response returned as icon' };
  }

  // PNG magic
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return { valid: true, mimeType: 'image/png' };
  }

  // ICO magic
  if (
    bytes[0] === 0x00 &&
    bytes[1] === 0x00 &&
    bytes[2] === 0x01 &&
    bytes[3] === 0x00
  ) {
    return { valid: true, mimeType: 'image/x-icon' };
  }

  // JPEG magic
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg' };
  }

  // WEBP magic
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes.byteLength >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { valid: true, mimeType: 'image/webp' };
  }

  // Safe SVG check
  if (prefixText.includes('<svg')) {
    const full = new TextDecoder('utf-8', { fatal: false }).decode(bytes).toLowerCase();
    if (!full.includes('</svg>')) {
      return { valid: false, error: 'Malformed SVG missing closing tag' };
    }
    if (
      full.includes('<script') ||
      full.includes('javascript:') ||
      full.includes('onload=') ||
      full.includes('onerror=')
    ) {
      return { valid: false, error: 'Rejected unsafe SVG content' };
    }
    return { valid: true, mimeType: 'image/svg+xml' };
  }

  return { valid: false, error: 'Unrecognized image magic bytes' };
}

/**
 * Asynchronously probes an icon URL using an HTML Image element (in browser) or fetch (in Node/worker).
 */
export async function validateImageAvailability(
  url: string,
  timeoutMs: number = 4500,
  signal?: AbortSignal
): Promise<{ valid: boolean; width?: number; height?: number; mimeType?: string; error?: string }> {
  if (!isValidIconUrl(url)) {
    return { valid: false, error: 'Malformed or prohibited icon URL' };
  }

  if (url.startsWith('data:image/')) {
    return { valid: true, width: 128, height: 128, mimeType: 'image/svg+xml' };
  }

  if (signal?.aborted) {
    return { valid: false, error: 'Cancelled' };
  }

  // Browser Image element verification (verifies actual decoded dimensions > 0)
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    return new Promise(resolve => {
      let settled = false;
      const img = new Image();

      const finish = (res: { valid: boolean; width?: number; height?: number; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
        resolve(res);
      };

      const onAbort = () => {
        img.src = '';
        finish({ valid: false, error: 'Cancelled' });
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const timer = setTimeout(() => {
        img.src = '';
        finish({ valid: false, error: 'Timeout loading image' });
      }, timeoutMs);

      img.onload = () => {
        if (img.naturalWidth >= 16 && img.naturalHeight >= 16) {
          finish({ valid: true, width: img.naturalWidth, height: img.naturalHeight });
        } else {
          finish({ valid: false, error: `Invalid image dimensions ${img.naturalWidth}x${img.naturalHeight}` });
        }
      };

      img.onerror = () => {
        finish({ valid: false, error: 'Network error or non-image payload' });
      };

      img.src = url;
    });
  }

  // Fetch + magic-byte validation in non-DOM/Node environments
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) {
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return validateImageBytes(buf, res.headers.get('content-type'));
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Fetch failed' };
  }
}
