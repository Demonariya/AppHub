import { ResolvedIcon } from './types';

interface CacheEntry {
  icon: ResolvedIcon;
  storedAt: number;
  ttlMs: number;
}

const CACHE_STORAGE_KEY_PREFIX = 'apphub_icon_cache_v2:';
const DEFAULT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-memory runtime cache
const memoryCache = new Map<string, CacheEntry>();

/**
 * Normalizes package ID for cache key isolation.
 */
function toCacheKey(packageId: string): string {
  return (packageId || '').trim().toLowerCase();
}

/**
 * Retrieves a cached resolved icon if present and valid.
 */
export function getCachedIcon(packageId: string): ResolvedIcon | undefined {
  if (!packageId) return undefined;
  const key = toCacheKey(packageId);

  // 1. Check in-memory map
  const mem = memoryCache.get(key);
  const now = Date.now();
  if (mem) {
    if (now - mem.storedAt < mem.ttlMs) {
      return { ...mem.icon, diagnostic: { ...mem.icon.diagnostic, cacheHit: true } };
    }
    // Expired
    memoryCache.delete(key);
  }

  // 2. Check localStorage if available
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const serialized = localStorage.getItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
      if (serialized) {
        const parsed: CacheEntry = JSON.parse(serialized);
        if (now - parsed.storedAt < parsed.ttlMs) {
          memoryCache.set(key, parsed);
          return { ...parsed.icon, diagnostic: { ...parsed.icon.diagnostic, cacheHit: true } };
        } else {
          localStorage.removeItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
        }
      }
    } catch {
      // LocalStorage access may fail in private mode or quota limit
    }
  }

  return undefined;
}

/**
 * Stores a resolved icon in the cache.
 */
export function setCachedIcon(
  packageId: string,
  icon: ResolvedIcon,
  ttlMs: number = DEFAULT_CACHE_TTL
): void {
  if (!packageId || !icon) return;
  const key = toCacheKey(packageId);
  const entry: CacheEntry = {
    icon,
    storedAt: Date.now(),
    ttlMs,
  };

  memoryCache.set(key, entry);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`, JSON.stringify(entry));
    } catch {
      // Ignore quota exceptions
    }
  }
}

/**
 * Invalidate cache for a single package or purge all icon caches.
 */
export function invalidateIconCache(packageId?: string): void {
  if (packageId) {
    const key = toCacheKey(packageId);
    memoryCache.delete(key);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(`${CACHE_STORAGE_KEY_PREFIX}${key}`);
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

/**
 * Inspect whether a package currently has an active cache entry.
 */
export function isIconCached(packageId: string): boolean {
  return getCachedIcon(packageId) !== undefined;
}
