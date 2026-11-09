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
export function getIconDiagnostics(packageId: string): IconDiagnosticInfo {
  const cached = getCachedIcon(packageId);
  if (cached) {
    return cached.diagnostic;
  }

  const record = getIconRecord(packageId);
  if (record) {
    return {
      packageId,
      sourceType: record.sourceType,
      primaryUrl: record.svgDataUri ? 'data:image/svg+xml' : record.url || '',
      fallbackUrl: record.url,
      cacheHit: false,
      resolvedAt: Date.now(),
      verified: record.verified,
      validationStatus: 'verified',
      notes: record.notes,
    };
  }

  return {
    packageId,
    sourceType: 'neutral-placeholder',
    primaryUrl: 'data:image/svg+xml (neutral monogram)',
    cacheHit: false,
    resolvedAt: Date.now(),
    verified: false,
    validationStatus: 'verified',
    notes: 'Unregistered package; will use neutral category monogram.',
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
