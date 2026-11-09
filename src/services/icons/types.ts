export type IconSourceType =
  | 'official-asset'     // Built-in verified SVG/data-uri directly bundled
  | 'official-cdn'       // Verified official developer CDN/repo
  | 'package-manifest'   // WinGet package manifest icon if verified
  | 'curated-registry'   // Curated authentic asset from verified repository
  | 'neutral-placeholder'; // AppHub category-aware monogram placeholder

export interface IconRecord {
  packageId: string;
  name: string;
  publisher: string;
  sourceType: IconSourceType;
  verified: boolean;
  url?: string;
  svgDataUri?: string;
  sourceUrl?: string;
  category?: string;
  notes?: string;
}

export interface ResolvedIcon {
  packageId: string;
  src: string;
  isSvg: boolean;
  sourceType: IconSourceType;
  fallbackSrc?: string;
  verified: boolean;
  altText: string;
  diagnostic: IconDiagnosticInfo;
}

export interface IconDiagnosticInfo {
  packageId: string;
  sourceType: IconSourceType;
  primaryUrl: string;
  fallbackUrl?: string;
  cacheHit?: boolean;
  resolvedAt: number;
  verified: boolean;
  validationStatus: 'verified' | 'cached' | 'pending' | 'failed';
  notes?: string;
}
