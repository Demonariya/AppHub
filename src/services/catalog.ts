import { CategoryType, Package } from '../types';

export const CATEGORIES_LIST: readonly CategoryType[] = [
  'Browsers',
  'Development',
  'Gaming',
  'Multimedia',
  'Communication',
  'Security',
  'Productivity',
  'Utilities',
  'System Tools',
  'Compression',
  'Drivers and Hardware Utilities',
  'Uncategorized',
] as const;

export function getPackageKey(id: string, source?: string): string {
  return `${(source || 'winget').toLowerCase()}::${id.toLowerCase()}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const CATEGORY_RULES: Array<[CategoryType, string[]]> = [
  ['Browsers', ['web browser', 'browser', 'chromium', 'gecko']],
  [
    'Development',
    [
      'ide',
      'compiler',
      'sdk',
      'programming',
      'developer',
      'git',
      'docker',
      'container',
      'code editor',
      'debugger',
      'nodejs',
      'python',
      'rust',
      'typescript',
    ],
  ],
  [
    'Compression',
    ['archiver', 'archive', 'zip', 'unzip', '7z', 'rar', 'tar', 'compression'],
  ],
  [
    'Security',
    [
      'password',
      'vpn',
      'encryption',
      'antivirus',
      'firewall',
      'security',
      'privacy',
      '2fa',
      'keepass',
    ],
  ],
  ['Gaming', ['game', 'gaming', 'launcher', 'emulator', 'steam', 'directx']],
  [
    'Multimedia',
    [
      'media player',
      'audio',
      'video',
      'music',
      'codec',
      'ffmpeg',
      'streaming',
      'image editor',
      'photo',
      '3d',
    ],
  ],
  [
    'Communication',
    ['chat', 'messaging', 'voip', 'email', 'mail client', 'video call', 'conferencing'],
  ],
  [
    'Productivity',
    ['notes', 'markdown', 'office', 'spreadsheet', 'pdf', 'calendar', 'todo', 'notion'],
  ],
  [
    'Drivers and Hardware Utilities',
    ['driver', 'gpu', 'peripheral', 'firmware', 'bios', 'keyboard', 'mouse utility'],
  ],
  [
    'System Tools',
    ['sysinternals', 'benchmark', 'monitoring', 'disk', 'partition', 'registry', 'diagnostics'],
  ],
  [
    'Utilities',
    ['utility', 'clipboard', 'screenshot', 'window manager', 'powertoys', 'file manager'],
  ],
];

/**
 * Infers a functional category strictly from genuine manifest tags or description.
 * Returns 'Uncategorized' when metadata is unavailable or ambiguous — never guesses arbitrarily.
 */
export function inferCategoryFromMetadata(
  tags?: string[],
  description?: string
): CategoryType {
  const parts: string[] = [];
  if (Array.isArray(tags) && tags.length > 0) {
    parts.push(...tags.map(t => t.toLowerCase()));
  }
  if (description && description.trim()) {
    parts.push(description.toLowerCase());
  }
  const corpus = parts.join(' ').trim();
  if (!corpus) return 'Uncategorized';

  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some(kw => corpus.includes(kw))) {
      return category;
    }
  }
  return 'Uncategorized';
}

export function isCatalogCacheStale(
  lastSyncAt: number | undefined | null,
  intervalHours: number,
  now = Date.now()
): boolean {
  if (!lastSyncAt || !Number.isFinite(lastSyncAt) || lastSyncAt <= 0) {
    return true;
  }
  const safeHours = Math.max(1, intervalHours || 24);
  return now - lastSyncAt >= safeHours * 60 * 60 * 1000;
}

/**
 * Normalizes ONLY genuine size metadata and composite key identity if provided.
 * Never invents fake download sizes, publishers, descriptions, or disk footprints.
 */
export function normalizePackageStorage(pkg: Package): Package {
  const downloadBytes =
    typeof pkg.downloadSizeBytes === 'number' &&
    Number.isFinite(pkg.downloadSizeBytes) &&
    pkg.downloadSizeBytes > 0
      ? pkg.downloadSizeBytes
      : typeof pkg.sizeBytes === 'number' &&
        Number.isFinite(pkg.sizeBytes) &&
        pkg.sizeBytes > 0
      ? pkg.sizeBytes
      : undefined;
  const installedBytes =
    typeof pkg.installedSizeBytes === 'number' &&
    Number.isFinite(pkg.installedSizeBytes) &&
    pkg.installedSizeBytes > 0
      ? pkg.installedSizeBytes
      : undefined;

  const formattedDownload = downloadBytes
    ? formatBytes(downloadBytes)
    : undefined;
  const formattedInstalled = installedBytes
    ? formatBytes(installedBytes)
    : undefined;

  return {
    ...pkg,
    packageKey: pkg.packageKey || getPackageKey(pkg.id, pkg.source),
    category: pkg.category || 'Uncategorized',
    tags: Array.isArray(pkg.tags) ? pkg.tags : [],
    architectures: Array.isArray(pkg.architectures) ? pkg.architectures : [],
    sizeBytes: downloadBytes,
    formattedSize: formattedDownload,
    downloadSizeBytes: downloadBytes,
    formattedDownloadSize: formattedDownload,
    installedSizeBytes: installedBytes,
    formattedInstalledSize: formattedInstalled,
  };
}
