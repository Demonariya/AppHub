/**
 * Generates neutral, category-aware monogram SVG data URIs.
 * Used exclusively when a package lacks an authentic icon.
 * Guarantees crisp high-contrast presentation without leaking generic website favicons.
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
};

const DEFAULT_THEME = { bg: '#171717', border: '#262626', accent: '#A3A3A3' };

export function generateNeutralMonogramUri({
  name,
  category = 'Utilities',
  packageId = '',
}: PlaceholderOptions): string {
  const theme = CATEGORY_COLORS[category] || DEFAULT_THEME;

  // Extract clean monogram initials (1-2 characters)
  const cleanName = (name || packageId || 'App').trim();
  const words = cleanName.split(/[\s.\-_]+/).filter(Boolean);
  let initials = 'A';
  if (words.length >= 2) {
    initials = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    initials = words[0].slice(0, 2).toUpperCase();
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  <rect width="100" height="100" rx="22" fill="${theme.bg}" stroke="${theme.border}" stroke-width="3" />
  <circle cx="50" cy="50" r="32" fill="${theme.border}" opacity="0.4" />
  <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="30" font-weight="700" fill="${theme.accent}" text-anchor="middle" dominant-baseline="middle" letter-spacing="0.5">
    ${initials}
  </text>
</svg>
  `.replace(/\s+/g, ' ').trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
