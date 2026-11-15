import { Package } from '../../types';
import { ResolvedIcon, IconSourceType } from './types';
import { getIconRecord } from './registry';
import {
  isValidIconUrl,
  isGenericFaviconLeak,
  validateImageAvailability,
} from './validator';
import {
  getCachedIcon,
  setCachedIcon,
  FAILED_CACHE_TTL_MS,
  VERIFIED_CACHE_TTL_MS,
} from './cache';
import { generateNeutralMonogramUri } from './placeholder';
import { isTauriEnvironment, invokeCommand, tryInvokeCommand } from '../tauriBridge';

const MAX_CONCURRENT_ICON_FETCHES = 6;
let activeIconFetches = 0;
const fetchWaiters: Array<() => void> = [];
const inFlightRequests = new Map<string, Promise<ResolvedIcon>>();

async function acquireFetchSlot(): Promise<void> {
  if (activeIconFetches < MAX_CONCURRENT_ICON_FETCHES) {
    activeIconFetches += 1;
    return;
  }
  await new Promise<void>(resolve => {
    fetchWaiters.push(resolve);
  });
  activeIconFetches += 1;
}

function releaseFetchSlot(): void {
  activeIconFetches = Math.max(0, activeIconFetches - 1);
  const next = fetchWaiters.shift();
  if (next) next();
}

export interface IconResolveOptions {
  forceRefresh?: boolean;
  signal?: AbortSignal;
  validator?: (
    url: string,
    timeoutMs?: number,
    signal?: AbortSignal
  ) => Promise<{ valid: boolean; width?: number; height?: number; mimeType?: string; error?: string }>;
}

function collectCandidateUrls(pkg: Package): Array<{ url: string; sourceType: IconSourceType }> {
  const candidates: Array<{ url: string; sourceType: IconSourceType }> = [];
  const seen = new Set<string>();
  const record = getIconRecord(pkg.id);

  const pushIfSafe = (url: string | undefined, sourceType: IconSourceType) => {
    if (!url) return;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) return;
    if (!isValidIconUrl(trimmed)) return;
    if (isGenericFaviconLeak(trimmed, pkg.id)) return;
    seen.add(trimmed);
    candidates.push({ url: trimmed, sourceType });
  };

  if (record?.url) {
    pushIfSafe(record.url, record.sourceType);
  }
  if (record?.fallbackUrl) {
    pushIfSafe(record.fallbackUrl, 'curated-registry');
  }
  if (pkg.icon) {
    pushIfSafe(pkg.icon, 'package-manifest');
  }

  return candidates;
}

function buildUrlFingerprint(pkg: Package, candidates: Array<{ url: string }>): string {
  return `${pkg.icon || ''}::${candidates.map(c => c.url).join('|')}`;
}

function buildNeutralPlaceholder(
  pkg: Package,
  status: 'pending' | 'failed',
  notes: string,
  primaryUrl = 'data:image/svg+xml (neutral monogram)'
): ResolvedIcon {
  const placeholderUri = generateNeutralMonogramUri({
    name: pkg.name,
    category: pkg.category,
    packageId: pkg.id,
  });

  return {
    packageId: pkg.id,
    source: pkg.source,
    src: placeholderUri,
    isSvg: true,
    sourceType: 'neutral-placeholder',
    fallbackSrc: undefined,
    verified: false,
    altText: `${pkg.name} ${status === 'failed' ? 'placeholder' : 'icon'}`,
    diagnostic: {
      packageId: pkg.id,
      source: pkg.source,
      sourceType: 'neutral-placeholder',
      primaryUrl,
      resolvedAt: Date.now(),
      verified: false,
      validationStatus: status,
      notes,
    },
  };
}

/**
 * Synchronous fast-path for instant rendering:
 * - Returns bundled official inline SVG assets immediately (`verified: true`)
 * - Returns verified cached entries (with cacheHit metadata) immediately
 * - Otherwise returns an honest pending neutral placeholder without pretending unverified remote URLs succeeded
 */
export function resolveAppIcon(pkg: Package): ResolvedIcon {
  const packageId = pkg.id || '';
  const now = Date.now();
  const record = getIconRecord(packageId);

  if (record?.svgDataUri) {
    return {
      packageId,
      source: pkg.source,
      src: record.svgDataUri,
      isSvg: true,
      sourceType: 'official-asset',
      fallbackSrc: record.url,
      verified: true,
      width: 100,
      height: 100,
      mimeType: 'image/svg+xml',
      altText: `${pkg.name} official logo`,
      diagnostic: {
        packageId,
        source: pkg.source,
        sourceType: 'official-asset',
        primaryUrl: 'data:image/svg+xml (bundled official asset)',
        fallbackUrl: record.url,
        resolvedAt: now,
        verified: true,
        validationStatus: 'verified',
        notes: record.notes || 'Rendered via bundled official vector asset.',
      },
    };
  }

  const candidates = collectCandidateUrls(pkg);
  const fingerprint = buildUrlFingerprint(pkg, candidates);
  const cached = getCachedIcon(packageId, pkg.source, fingerprint);
  if (cached) {
    return cached;
  }

  if (candidates.length > 0) {
    return buildNeutralPlaceholder(
      pkg,
      'pending',
      `Awaiting verification for ${candidates[0].url}`,
      candidates[0].url
    );
  }

  return buildNeutralPlaceholder(
    pkg,
    'failed',
    'No verified icon candidate available; using neutral category monogram.'
  );
}

/**
 * Asynchronously resolves, verifies, and persists application icons.
 * Deduplicates concurrent callers, enforces bounded concurrency (max 6),
 * uses native Rust AppData + SQLite binary caching in Tauri desktop mode,
 * and falls back cleanly on error without poisoning caches.
 */
export async function resolveAppIconAsync(
  pkg: Package,
  options: IconResolveOptions = {}
): Promise<ResolvedIcon> {
  const packageId = pkg.id || '';
  if (!packageId) {
    return buildNeutralPlaceholder(pkg, 'failed', 'Missing package identifier');
  }

  const record = getIconRecord(packageId);
  if (record?.svgDataUri) {
    return resolveAppIcon(pkg);
  }

  const candidates = collectCandidateUrls(pkg);
  const fingerprint = buildUrlFingerprint(pkg, candidates);

  if (!options.forceRefresh) {
    const cached = getCachedIcon(packageId, pkg.source, fingerprint);
    if (cached) {
      return cached;
    }
  }

  if (candidates.length === 0) {
    return buildNeutralPlaceholder(
      pkg,
      'failed',
      'No verified remote icon URLs matched safe policy.'
    );
  }

  const requestKey = `${(pkg.source || 'winget').toLowerCase()}::${packageId.toLowerCase()}::${fingerprint}`;
  const existingInFlight = !options.forceRefresh ? inFlightRequests.get(requestKey) : undefined;
  if (existingInFlight) {
    return existingInFlight;
  }

  const runPromise = (async (): Promise<ResolvedIcon> => {
    await acquireFetchSlot();
    try {
      if (options.signal?.aborted) {
        return buildNeutralPlaceholder(pkg, 'pending', 'Icon request cancelled');
      }

      // Desktop Tauri path: native curl download, magic-byte + HTML/XSS validation, disk + SQLite icon_cache
      if (isTauriEnvironment() && !options.validator) {
        try {
          const nativeRes = await invokeCommand<{
            cache_key: string;
            package_id: string;
            source: string;
            source_type: string;
            resolved_url?: string;
            data_uri?: string;
            mime_type?: string;
            sha256?: string;
            width?: number;
            height?: number;
            status: string;
            error_message?: string;
            fetched_at: number;
            expires_at: number;
            verified: boolean;
            from_cache: boolean;
          }>('resolve_and_cache_icon', {
            packageId,
            source: pkg.source || 'winget',
            sourceType: candidates[0].sourceType,
            candidateUrls: candidates.map(c => c.url),
            forceRefresh: Boolean(options.forceRefresh),
          });

          if (nativeRes.verified && nativeRes.data_uri) {
            const matchedCandidate = candidates.find(c => c.url === nativeRes.resolved_url);
            const verifiedIcon: ResolvedIcon = {
              packageId,
              source: pkg.source,
              src: nativeRes.data_uri,
              isSvg: nativeRes.mime_type === 'image/svg+xml',
              sourceType: matchedCandidate?.sourceType || candidates[0].sourceType,
              verified: true,
              width: nativeRes.width,
              height: nativeRes.height,
              mimeType: nativeRes.mime_type,
              sha256: nativeRes.sha256,
              altText: `${pkg.name} verified icon`,
              diagnostic: {
                packageId,
                source: pkg.source,
                sourceType: matchedCandidate?.sourceType || candidates[0].sourceType,
                primaryUrl: nativeRes.resolved_url || candidates[0].url,
                cacheHit: nativeRes.from_cache,
                resolvedAt: nativeRes.fetched_at || Date.now(),
                verified: true,
                validationStatus: 'verified',
                notes: nativeRes.from_cache
                  ? 'Loaded verified binary from AppData SQLite icon cache.'
                  : 'Downloaded, magic-byte validated, and cached locally.',
              },
            };
            setCachedIcon(packageId, verifiedIcon, {
              source: pkg.source,
              urlFingerprint: fingerprint,
              ttlMs: VERIFIED_CACHE_TTL_MS,
            });
            return verifiedIcon;
          }

          const failedIcon = buildNeutralPlaceholder(
            pkg,
            'failed',
            nativeRes.error_message || 'Native icon validation failed',
            nativeRes.resolved_url || candidates[0].url
          );
          setCachedIcon(packageId, failedIcon, {
            source: pkg.source,
            urlFingerprint: fingerprint,
            ttlMs: FAILED_CACHE_TTL_MS,
          });
          return failedIcon;
        } catch (err: any) {
          // Fall through to browser validator if native command fails unexpectedly
          console.warn(`[IconPipeline] Native resolve failed for ${packageId}:`, err);
        }
      }

      // Browser / Test runtime path: try candidates in strict priority order
      const validator = options.validator || validateImageAvailability;
      let lastError = 'All icon candidates failed validation';

      for (const candidate of candidates) {
        if (options.signal?.aborted) {
          return buildNeutralPlaceholder(pkg, 'pending', 'Icon request cancelled');
        }
        const check = await validator(candidate.url, 4500, options.signal);
        if (check.valid) {
          const verifiedIcon: ResolvedIcon = {
            packageId,
            source: pkg.source,
            src: candidate.url,
            isSvg: candidate.url.toLowerCase().endsWith('.svg') || check.mimeType === 'image/svg+xml',
            sourceType: candidate.sourceType,
            verified: true,
            width: check.width,
            height: check.height,
            mimeType: check.mimeType,
            altText: `${pkg.name} verified icon`,
            diagnostic: {
              packageId,
              source: pkg.source,
              sourceType: candidate.sourceType,
              primaryUrl: candidate.url,
              resolvedAt: Date.now(),
              verified: true,
              validationStatus: 'verified',
              notes: `Verified ${candidate.sourceType} icon asset.`,
            },
          };
          setCachedIcon(packageId, verifiedIcon, {
            source: pkg.source,
            urlFingerprint: fingerprint,
            ttlMs: VERIFIED_CACHE_TTL_MS,
          });
          return verifiedIcon;
        }
        lastError = check.error || `Rejected ${candidate.url}`;
      }

      const failedIcon = buildNeutralPlaceholder(
        pkg,
        'failed',
        lastError,
        candidates[0].url
      );
      setCachedIcon(packageId, failedIcon, {
        source: pkg.source,
        urlFingerprint: fingerprint,
        ttlMs: FAILED_CACHE_TTL_MS,
      });
      return failedIcon;
    } finally {
      releaseFetchSlot();
      inFlightRequests.delete(requestKey);
    }
  })();

  inFlightRequests.set(requestKey, runPromise);
  return runPromise;
}

export async function prefetchAppIcons(
  packages: Package[],
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const batch = packages.slice(0, options.limit ?? 24);
  await Promise.allSettled(
    batch.map(pkg => resolveAppIconAsync(pkg, { signal: options.signal }))
  );
}

export async function clearPersistentIconCache(
  packageId?: string,
  source?: string
): Promise<void> {
  const { invalidateIconCache } = await import('./cache');
  invalidateIconCache(packageId, source);
  if (isTauriEnvironment()) {
    await tryInvokeCommand('invalidate_icon_cache', {
      packageId: packageId || null,
      source: source || null,
    });
  }
}

export function getAppIconUrl(pkg: Package): string {
  return resolveAppIcon(pkg).src;
}

export function getSecondaryIconFallback(pkg: Package): string {
  const resolved = resolveAppIcon(pkg);
  if (resolved.fallbackSrc && isValidIconUrl(resolved.fallbackSrc)) {
    return resolved.fallbackSrc;
  }
  return generateNeutralMonogramUri({
    name: pkg.name,
    category: pkg.category,
    packageId: pkg.id,
  });
}

export function getIconFetchConcurrencyStats(): {
  active: number;
  inFlight: number;
  maxConcurrent: number;
} {
  return {
    active: activeIconFetches,
    inFlight: inFlightRequests.size,
    maxConcurrent: MAX_CONCURRENT_ICON_FETCHES,
  };
}
