/**
 * Validates icon URLs, MIME types, and image payloads.
 * Protects against 404s, HTML error pages, zero-byte assets, and generic fallback leaks.
 */

const PROHIBITED_SUBSTRINGS = [
  'raw.githubusercontent.com/microsoft/winget-pkgs', // Deprecated/dead winget repo icon paths
];

const VALID_IMAGE_EXTENSIONS = ['.png', '.svg', '.ico', '.webp', '.jpg', '.jpeg'];

/**
 * Synchronously checks if a candidate icon URL is well-formed and safe.
 */
export function isValidIconUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  if (trimmed.length === 0) return false;

  // Accept data URIs for inline SVGs/images
  if (trimmed.startsWith('data:image/svg+xml') || trimmed.startsWith('data:image/png')) {
    return trimmed.length > 30; // must contain non-empty data
  }

  // Must be valid HTTP/HTTPS URL
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Reject known dead or broken hosts
    for (const bad of PROHIBITED_SUBSTRINGS) {
      if (trimmed.includes(bad)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a given URL is a prohibited generic favicon fallback.
 * (e.g. microsoft.com favicon applied generically to all apps)
 */
export function isGenericFaviconLeak(url: string, packageId: string): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  const lowerPkg = packageId.toLowerCase();

  // If URL targets microsoft.com but the package is NOT a Microsoft package
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
 * Asynchronously probes an icon URL using an HTML Image element (in browser) or fetch (in Node/worker).
 */
export async function validateImageAvailability(
  url: string,
  timeoutMs: number = 4000
): Promise<{ valid: boolean; width?: number; height?: number; error?: string }> {
  if (!isValidIconUrl(url)) {
    return { valid: false, error: 'Malformed or prohibited icon URL' };
  }

  // Inline data URIs are instantly valid
  if (url.startsWith('data:image/')) {
    return { valid: true, width: 128, height: 128 };
  }

  // Browser Image loading test
  if (typeof window !== 'undefined' && typeof Image !== 'undefined') {
    return new Promise(resolve => {
      let resolved = false;
      const img = new Image();

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          img.src = '';
          resolve({ valid: false, error: 'Timeout loading image' });
        }
      }, timeoutMs);

      img.onload = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          if (img.naturalWidth > 0 && img.naturalHeight > 0) {
            resolve({ valid: true, width: img.naturalWidth, height: img.naturalHeight });
          } else {
            resolve({ valid: false, error: 'Zero-dimension image' });
          }
        }
      };

      img.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve({ valid: false, error: 'Network error or 404' });
        }
      };

      img.crossOrigin = 'anonymous';
      img.src = url;
    });
  }

  // Head request in non-DOM environments
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) {
      return { valid: false, error: `HTTP ${res.status}` };
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('image/') && !contentType.includes('application/octet-stream')) {
      return { valid: false, error: `Invalid MIME type: ${contentType}` };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err?.message || 'Fetch failed' };
  }
}
