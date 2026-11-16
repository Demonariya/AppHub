import { IconDiagnosticInfo } from './types';
import { ICON_REGISTRY, getIconRecord } from './registry';
import { getCachedIcon, isIconCached } from './cache';

export interface IconSystemStats {
  totalRegistered: number;
  totalVerified: number;
  totalOfficialAssets: number;
  totalOfficialCdn: number;
  totalCurated: number;
  cachedCount: number;
}

/**
 * Returns diagnostics for a specific package.
 */
export function getIconDiagnostics(
  packageId: string,
  source?: string
): IconDiagnosticInfo {
  const cached = getCachedIcon(packageId, source);
  if (cached) {
    return cached.diagnostic;
  }

  const record = getIconRecord(packageId);
  if (record) {
    return {
      packageId,
      source,
      sourceType: record.sourceType,
      primaryUrl: record.svgDataUri ? 'data:image/svg+xml (bundled official asset)' : record.url || '',
      fallbackUrl: record.fallbackUrl || record.url,
      candidatesTried: [record.url, record.fallbackUrl].filter((u): u is string => Boolean(u)),
      mimeType: record.svgDataUri ? 'image/svg+xml' : undefined,
      width: record.svgDataUri ? 100 : undefined,
      height: record.svgDataUri ? 100 : undefined,
      cacheHit: false,
      resolvedAt: Date.now(),
      verified: record.verified,
      validationStatus: record.svgDataUri ? 'verified' : 'pending',
      notes: record.notes,
    };
  }

  return {
    packageId,
    source,
    sourceType: 'neutral-placeholder',
    primaryUrl: 'data:image/svg+xml (neutral application symbol)',
    cacheHit: false,
    resolvedAt: Date.now(),
    verified: false,
    validationStatus: 'pending',
    notes: 'Unregistered package; awaiting dynamic discovery or using neutral application symbol.',
  };
}

/**
 * Returns overarching health statistics of the AppHub Icon System.
 */
export function getIconSystemStats(): IconSystemStats {
  const values = Object.values(ICON_REGISTRY);
  let totalOfficialAssets = 0;
  let totalOfficialCdn = 0;
  let totalCurated = 0;

  for (const v of values) {
    if (v.sourceType === 'official-asset') totalOfficialAssets++;
    else if (v.sourceType === 'official-cdn') totalOfficialCdn++;
    else if (v.sourceType === 'curated-registry') totalCurated++;
  }

  return {
    totalRegistered: values.length,
    totalVerified: values.filter(v => v.verified).length,
    totalOfficialAssets,
    totalOfficialCdn,
    totalCurated,
    cachedCount: values.filter(v => isIconCached(v.packageId)).length,
  };
}
