import { Package } from '../../types';
import { ResolvedIcon, IconSourceType, IconDiagnosticInfo } from './types';
import { getIconRecord } from './registry';
import { isValidIconUrl, isGenericFaviconLeak } from './validator';
import { getCachedIcon, setCachedIcon } from './cache';
import { generateNeutralMonogramUri } from './placeholder';

/**
 * Resolves an authentic, verified application icon for any WinGet package.
 * Strict Fallback Hierarchy:
 * 1. Verified official application logo (inline SVG asset or verified official CDN)
 * 2. Verified package manifest icon (WinGet manifest icon if non-dead URL)
 * 3. Verified curated repository icon
 * 4. Neutral AppHub monogram placeholder (clean, category-aware, no generic favicon leaks)
 */
export function resolveAppIcon(pkg: Package): ResolvedIcon {
  const packageId = pkg.id || '';
  const now = Date.now();

  // Check cache first
  const cached = getCachedIcon(packageId);
  if (cached) {
    return cached;
  }

  const record = getIconRecord(packageId);

  // 1. Tier 1: Verified Official Application Asset / SVG
  if (record?.svgDataUri) {
    const resolved: ResolvedIcon = {
      packageId,
      src: record.svgDataUri,
      isSvg: true,
      sourceType: 'official-asset',
      fallbackSrc: record.url,
      verified: true,
      altText: `${pkg.name} official logo`,
      diagnostic: {
        packageId,
        sourceType: 'official-asset',
        primaryUrl: 'data:image/svg+xml (bundled official asset)',
        fallbackUrl: record.url,
        resolvedAt: now,
        verified: true,
        validationStatus: 'verified',
        notes: record.notes || 'Rendered via official vector asset.',
      },
    };
    setCachedIcon(packageId, resolved);
    return resolved;
  }

  // 2. Tier 1 / 3: Verified Registry URL (Official CDN or Curated)
  if (record?.url && isValidIconUrl(record.url)) {
    const resolved: ResolvedIcon = {
      packageId,
      src: record.url,
      isSvg: record.url.endsWith('.svg'),
      sourceType: record.sourceType,
      fallbackSrc: undefined,
      verified: true,
      altText: `${pkg.name} verified icon`,
      diagnostic: {
        packageId,
        sourceType: record.sourceType,
        primaryUrl: record.url,
        resolvedAt: now,
        verified: true,
        validationStatus: 'verified',
        notes: `Matched registry entry from ${record.sourceUrl || 'verified source'}.`,
      },
    };
    setCachedIcon(packageId, resolved);
    return resolved;
  }

  // 3. Tier 2: Verified Package Manifest Icon
  if (
    pkg.icon &&
    isValidIconUrl(pkg.icon) &&
    !isGenericFaviconLeak(pkg.icon, packageId)
  ) {
    const resolved: ResolvedIcon = {
      packageId,
      src: pkg.icon,
      isSvg: pkg.icon.endsWith('.svg'),
      sourceType: 'package-manifest',
      fallbackSrc: undefined,
      verified: false,
      altText: `${pkg.name} package icon`,
      diagnostic: {
        packageId,
        sourceType: 'package-manifest',
        primaryUrl: pkg.icon,
        resolvedAt: now,
        verified: false,
        validationStatus: 'pending',
        notes: 'Loaded from WinGet package manifest metadata.',
      },
    };
    setCachedIcon(packageId, resolved);
    return resolved;
  }

  // 4. Tier 4: Clean Neutral Monogram Placeholder (NEVER return generic website favicons or Microsoft favicon!)
  const placeholderUri = generateNeutralMonogramUri({
    name: pkg.name,
    category: pkg.category,
    packageId: pkg.id,
  });

  const fallbackResolved: ResolvedIcon = {
    packageId,
    src: placeholderUri,
    isSvg: true,
    sourceType: 'neutral-placeholder',
    fallbackSrc: undefined,
    verified: false,
    altText: `${pkg.name} placeholder`,
    diagnostic: {
      packageId,
      sourceType: 'neutral-placeholder',
      primaryUrl: 'data:image/svg+xml (neutral monogram)',
      resolvedAt: now,
      verified: false,
      validationStatus: 'verified',
      notes: 'No verified logo available; using clean category-aware monogram.',
    },
  };

  setCachedIcon(packageId, fallbackResolved);
  return fallbackResolved;
}

/**
 * Returns primary image URL string for backwards compatibility with legacy callers.
 */
export function getAppIconUrl(pkg: Package): string {
  const resolved = resolveAppIcon(pkg);
  return resolved.src;
}

/**
 * Returns secondary fallback URL for backwards compatibility.
 * Replaces generic microsoft.com favicon with package-isolated clean monogram.
 */
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
