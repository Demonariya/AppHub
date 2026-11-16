/**
 * Generates neutral, category-aware geometric application placeholder SVG data URIs.
 * Used exclusively when a package lacks an authentic icon.
 * Renders a crisp application window/cube symbol instead of misleading 2-letter initials.
 */

interface PlaceholderOptions {
  name: string;
  category?: string;
  packageId?: string;
}

// Category palette mapping
const CATEGORY_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  'Developer Tools': { bg: '#0F172A', border: '#1E293B', accent: '#38BDF8' },
  'Development': { bg: '#0F172A', border: '#1E293B', accent: '#38BDF8' },
  'Browsers': { bg: '#18181B', border: '#27272A', accent: '#A1A1AA' },
  'Gaming': { bg: '#181824', border: '#28283E', accent: '#A855F7' },
  'Multimedia': { bg: '#1C1917', border: '#292524', accent: '#F97316' },
  'Communication': { bg: '#172554', border: '#1E3A8A', accent: '#60A5FA' },
  'Security': { bg: '#14532D', border: '#166534', accent: '#4ADE80' },
  'Productivity': { bg: '#1E1B4B', border: '#312E81', accent: '#818CF8' },
  'Utilities': { bg: '#18181B', border: '#27272A', accent: '#94A3B8' },
  'Compression': { bg: '#1C1917', border: '#292524', accent: '#FBBF24' },
  'Hardware': { bg: '#14532D', border: '#15803D', accent: '#22C55E' },
  'Drivers and Hardware Utilities': { bg: '#14532D', border: '#15803D', accent: '#22C55E' },
  'System Tools': { bg: '#0F172A', border: '#334155', accent: '#60A5FA' },
};

const DEFAULT_THEME = { bg: '#171717', border: '#262626', accent: '#94A3B8' };

export function generateNeutralPlaceholderUri({
  category = 'Utilities',
}: PlaceholderOptions): string {
  const theme = CATEGORY_COLORS[category] || DEFAULT_THEME;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" rx="22" fill="${theme.bg}" stroke="${theme.border}" stroke-width="3" />
  <rect x="24" y="26" width="52" height="48" rx="10" fill="none" stroke="${theme.accent}" stroke-width="4" stroke-opacity="0.9" />
  <line x1="24" y1="40" x2="76" y2="40" stroke="${theme.accent}" stroke-width="3.5" stroke-opacity="0.65" />
  <circle cx="33" cy="33" r="2.5" fill="${theme.accent}" />
  <circle cx="41" cy="33" r="2.5" fill="${theme.accent}" fill-opacity="0.7" />
  <path d="M50 48L62 54.5V66.5L50 73L38 66.5V54.5L50 48Z" fill="${theme.accent}" fill-opacity="0.22" stroke="${theme.accent}" stroke-width="2.5" stroke-linejoin="round" />
</svg>
  `.replace(/\s+/g, ' ').trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Backwards-compatible export symbol
export const generateNeutralMonogramUri = generateNeutralPlaceholderUri;
