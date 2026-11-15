import { ResolvedIcon } from './types';

interface CacheEntry {
  icon: ResolvedIcon;
  urlFingerprint?: string;
  storedAt: number;
  ttlMs: number;
}

const CACHE_STORAGE_KEY_PREFIX = 'apphub_icon_cache_v3:';
export const VERIFIED_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const FAILED_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory runtime cache
const memoryCache = new Map<string, CacheEntry>();

function toCacheKey(packageId: string, source?: string): string {
  const src = (source || 'winget').trim().toLowerCase() || 'winget';
  const id = (packageId || '').trim().toLowerCase();
  return `${src}::${id}`;
}

export function getCachedIcon(
  packageId: string,
  source?: string,
  urlFingerprint?: string
): ResolvedIcon | undefined {
  if (!packageId) return undefined;
  const key = toCacheKey(packageId, source);
  const now = Date.now();

  const validateEntry = (entry: CacheEntry): ResolvedIcon | undefined => {
    if (now - entry.storedAt >= entry.ttlMs) {
      return undefined;
    }
    if (
      urlFingerprint !== undefined &&
      entry.urlFingerprint !== undefined &&
      entry.urlFingerprint !== urlFingerprint
    ) {
      return undefined;
    }
    return {
      ...entry.icon,
      diagnostic: { ...entry.icon.diagnostic, cacheHit: true },
    };
  };

  // 1. Check in-memory map
  const mem = memoryCache.get(key);
  if (mem) {
    const valid = validateEntry(mem);
    if (valid) return valid;
    memoryCache.delete(key);
  }

  // 2. Check localStorage if available
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const serialized = localStorage.getItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
      if (serialized) {
        const parsed: CacheEntry = JSON.parse(serialized);
        const valid = validateEntry(parsed);
        if (valid) {
          memoryCache.set(key, parsed);
          return valid;
        }
        localStorage.removeItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
      }
    } catch {
      // Ignore storage access or parse failures
    }
  }

  return undefined;
}

/**
 * Stores a verified icon or short-lived failure record in cache.
 * Never persistently caches neutral placeholders or unverified pending icons.
 */
export function setCachedIcon(
  packageId: string,
  icon: ResolvedIcon,
  options: {
    source?: string;
    urlFingerprint?: string;
    ttlMs?: number;
  } = {}
): void {
  if (!packageId || !icon) return;

  // Never permanently cache unverified neutral placeholders or pending states
  if (icon.sourceType === 'neutral-placeholder' && icon.diagnostic.validationStatus !== 'failed') {
    return;
  }

  const key = toCacheKey(packageId, options.source ?? icon.source);
  const ttlMs =
    options.ttlMs ??
    (icon.verified ? VERIFIED_CACHE_TTL_MS : FAILED_CACHE_TTL_MS);

  const entry: CacheEntry = {
    icon,
    urlFingerprint: options.urlFingerprint,
    storedAt: Date.now(),
    ttlMs,
  };

  memoryCache.set(key, entry);

  // Persist verified entries (or short-lived failures) to localStorage
  if (typeof window !== 'undefined' && window.localStorage && icon.verified) {
    try {
      localStorage.setItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Ignore quota exceptions
    }
  }
}

export function invalidateIconCache(packageId?: string, source?: string): void {
  if (packageId) {
    const targetId = packageId.trim().toLowerCase();
    const specificKey = source ? toCacheKey(packageId, source) : null;

    if (specificKey) {
      memoryCache.delete(specificKey);
    } else {
      for (const k of Array.from(memoryCache.keys())) {
        if (k.endsWith(`::${targetId}`)) {
          memoryCache.delete(k);
        }
      }
    }

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        if (specificKey) {
          localStorage.removeItem(`${CACHE_STORAGE_KEY_PREFIX}${specificKey}`);
        } else {
          const toDelete: string[] = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith(CACHE_STORAGE_KEY_PREFIX) && k.endsWith(`::${targetId}`)) {
              toDelete.push(k);
            }
          }
          for (const k of toDelete) {
            localStorage.removeItem(k);
          }
        }
      } catch {
        // ignore
      }
    }
  } else {
    memoryCache.clear();
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CACHE_STORAGE_KEY_PREFIX)) {
            keysToRemove.push(k);
          }
        }
        for (const k of keysToRemove) {
          localStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
    }
  }
}

export function isIconCached(packageId: string, source?: string): boolean {
  return getCachedIcon(packageId, source) !== undefined;
}
