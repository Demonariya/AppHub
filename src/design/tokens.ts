export const DESIGN_TOKENS = {
  layout: {
    titlebarHeightPx: 36,
    headerHeightPx: 52,
    sidebarExpandedPx: 224,
    sidebarCollapsedPx: 64,
  },
  radius: {
    sm: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
  },
  spacing: {
    pagePadding: 'p-4 sm:p-6 lg:p-8',
    cardPadding: 'p-4',
    panelPadding: 'p-5',
    maxWidth: 'max-w-7xl mx-auto',
    sectionGap: 'space-y-8',
    gridGap: 'gap-4',
  },
  controls: {
    sm: 'h-7 px-2.5 text-xs',
    md: 'h-8 px-3.5 text-xs',
    lg: 'h-10 px-5 text-[13px]',
  },
  icons: {
    sm: { containerPx: 32, imagePx: 20 },
    md: { containerPx: 44, imagePx: 28 },
    lg: { containerPx: 64, imagePx: 44 },
    xl: { containerPx: 80, imagePx: 56 },
  },
  typography: {
    pageTitle: 'text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)]',
    pageSubtitle: 'text-xs sm:text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed',
    sectionTitle: 'text-sm sm:text-base font-semibold tracking-tight text-[var(--text-primary)]',
    monoMeta: 'font-mono text-[11px] tabular-nums text-[var(--text-muted)]',
  },
  motion: {
    durationFast: 120,
    durationNormal: 180,
    ease: [0.16, 1, 0.3, 1] as const,
  },
} as const;
