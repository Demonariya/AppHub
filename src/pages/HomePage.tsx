import React from 'react';
import { Package, TaskAction, WinGetEnvironment, CategoryType } from '../types';
import { AppCard } from '../components/common/AppCard';
import { AppIconImage } from '../components/common/AppIconImage';
import { isTauriEnvironment } from '../services/tauriBridge';
import {
  ArrowUpCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Download,
  Terminal,
  Code2,
  Wrench,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Info,
  Search,
  Compass,
} from 'lucide-react';
import { Button, SectionHeader, EmptyState } from '../components/ui';

interface HomePageProps {
  packages: Package[];
  environment?: WinGetEnvironment;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  onNavigateToUpdates: () => void;
  onNavigateToDiscover: () => void;
  onNavigateToCategory?: (category: CategoryType) => void;
  onNavigateToSettings?: () => void;
  onRefreshEnvironment?: () => void;
  onOpenQuickSearch?: () => void;
}

const QUICK_CATEGORIES: CategoryType[] = [
  'Development',
  'Browsers',
  'Utilities',
  'Security',
  'Multimedia',
  'Productivity',
];

export const HomePage: React.FC<HomePageProps> = ({
  packages,
  environment,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  onNavigateToUpdates,
  onNavigateToDiscover,
  onNavigateToCategory,
  onNavigateToSettings,
  onRefreshEnvironment,
  onOpenQuickSearch,
}) => {
  const isDesktop = isTauriEnvironment();

  const updateAvailablePackages = packages.filter(
    p =>
      !p.isExternal &&
      p.isInstalled &&
      p.installedVersion &&
      p.latestVersion &&
      p.installedVersion !== p.latestVersion
  );

  const featured = packages.find(p => p.id === 'Microsoft.VisualStudioCode') || packages[0];
  const devTools = packages
    .filter(p => p.category === 'Development' && p.id !== featured?.id)
    .slice(0, 4);
  const recentlyPublished = [...packages]
    .filter(p => Boolean(p.releaseDate))
    .sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''))
    .slice(0, 4);
  const utilitiesAndSecurity = packages
    .filter(p => p.category === 'Utilities' || p.category === 'Security')
    .slice(0, 4);
  const installed = packages.filter(p => p.isInstalled).slice(0, 4);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-8 animate-page-in">
      {/* Compact Store Welcome Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-subtle)]">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
            Windows Software Store
          </h1>
          <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-1">
            Discover, verify, install, and maintain Windows software powered directly by Microsoft WinGet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenQuickSearch && (
            <Button
              size="md"
              variant="secondary"
              leftIcon={<Search className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
              onClick={onOpenQuickSearch}
            >
              Quick Search (Ctrl+K)
            </Button>
          )}
          <Button
            size="md"
            variant="primary"
            leftIcon={<Compass className="w-3.5 h-3.5" />}
            onClick={onNavigateToDiscover}
          >
            Explore Catalog
          </Button>
        </div>
      </div>

      {/* WinGet Missing Warning Banner (Desktop Only) */}
      {isDesktop && environment && !environment.isInstalled && (
        <div className="rounded-[12px] p-4 sm:p-5 bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-[var(--surface-panel)] border border-[var(--status-danger-border)] flex items-center justify-center text-[var(--status-danger-fg)] shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-[var(--text-primary)]">
                Microsoft WinGet CLI Not Detected
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                AppHub requires <code className="font-mono text-[var(--status-danger-fg)]">winget.exe</code> to install, update, and query packages. Install App Installer from Microsoft or set a custom executable path in Settings.
              </p>
              {environment.error && (
                <p className="text-[11px] font-mono text-[var(--status-danger-fg)] mt-1">
                  {environment.error}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="https://aka.ms/getwinget"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-[8px] bg-[var(--status-danger-fg)] text-white hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <span>Get App Installer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {onNavigateToSettings && (
              <Button size="md" variant="secondary" onClick={onNavigateToSettings}>
                Configure Path
              </Button>
            )}
            {onRefreshEnvironment && (
              <Button
                size="md"
                variant="secondary"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={onRefreshEnvironment}
              >
                Retry
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Non-intrusive Browser Preview Notice */}
      {!isDesktop && (
        <div className="rounded-[10px] px-4 py-3 bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
          <Info className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong className="text-[var(--text-primary)] font-semibold">Browser Preview Mode:</strong>{' '}
            Catalog browsing, CLI command preview, manifest import/export, and preferences are interactive here. Native WinGet installations and local inventory scanning require the AppHub Windows desktop app.
          </p>
        </div>
      )}

      {/* Pending Updates Action Strip */}
      {updateAvailablePackages.length > 0 && (
        <div className="rounded-[12px] p-4 bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-[var(--surface-panel)] border border-[var(--status-warning-border)] flex items-center justify-center text-[var(--status-warning-fg)] shrink-0">
              <ArrowUpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-sm text-[var(--text-primary)]">
                {updateAvailablePackages.length} Application Update
                {updateAvailablePackages.length === 1 ? '' : 's'} Available
              </h2>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                Newer releases detected via WinGet manifests for installed software.
              </p>
            </div>
          </div>

          <Button
            size="md"
            variant="warning"
            rightIcon={<ChevronRight className="w-4 h-4" />}
            onClick={onNavigateToUpdates}
          >
            Review Updates
          </Button>
        </div>
      )}

      {/* Spotlight Package */}
      {featured && (
        <div
          onClick={() => onOpenDetails(featured)}
          role="button"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDetails(featured);
            }
          }}
          className="rounded-[14px] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--surface-panel)] p-6 sm:p-7 cursor-pointer group shadow-[var(--shadow-card)] transition-all"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] font-mono">
                <span className="text-[var(--accent-primary)] font-semibold">Featured</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span>{featured.publisher}</span>
                <span className="text-[var(--text-muted)]">·</span>
                <span className="tabular-nums">v{featured.latestVersion}</span>
                {(featured.formattedDownloadSize || featured.formattedSize) && (
                  <>
                    <span className="text-[var(--text-muted)]">·</span>
                    <span>{featured.formattedDownloadSize || featured.formattedSize}</span>
                  </>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors tracking-tight">
                {featured.name}
              </h2>

              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                {featured.longDescription || featured.description}
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1" onClick={e => e.stopPropagation()}>
                <Button
                  size="lg"
                  variant="primary"
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() =>
                    onActionClick(featured, featured.isInstalled ? 'reinstall' : 'install')
                  }
                >
                  {featured.isInstalled ? 'Reinstall' : `Install ${featured.name}`}
                </Button>

                <Button size="lg" variant="secondary" onClick={() => onOpenDetails(featured)}>
                  Package Details
                </Button>

                <div className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-[var(--text-muted)] pl-2">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>winget install --id {featured.id}</span>
                </div>
              </div>
            </div>

            <AppIconImage
              pkg={featured}
              size="xl"
              className="group-hover:scale-105 transition-transform duration-200"
            />
          </div>
        </div>
      )}

      {/* Quick Category Shortcuts */}
      {onNavigateToCategory && (
        <section className="space-y-3">
          <SectionHeader
            title="Browse by Category"
            action={
              <button
                type="button"
                onClick={onNavigateToDiscover}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>All categories</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {QUICK_CATEGORIES.map(cat => {
              const count = packages.filter(p => p.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onNavigateToCategory(cat)}
                  className="p-3 rounded-[10px] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-left transition-colors cursor-pointer"
                >
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {cat}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-muted)] mt-0.5 tabular-nums">
                    {count} packages
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Developer Tools */}
      {devTools.length > 0 && (
        <section className="space-y-3.5">
          <SectionHeader
            title="Developer Tools"
            icon={<Code2 className="w-4 h-4" />}
            action={
              <button
                type="button"
                onClick={onNavigateToDiscover}
                className="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <span>Explore all</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {devTools.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Updated Releases */}
      {recentlyPublished.length > 0 && (
        <section className="space-y-3.5">
          <SectionHeader
            title="Recently Updated Releases"
            icon={<Clock className="w-4 h-4 text-[var(--status-success-fg)]" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentlyPublished.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Essential Utilities & Security */}
      {utilitiesAndSecurity.length > 0 && (
        <section className="space-y-3.5">
          <SectionHeader
            title="Utilities & Security"
            icon={<Wrench className="w-4 h-4 text-[var(--accent-primary)]" />}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {utilitiesAndSecurity.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        </section>
      )}

      {/* Installed Software Snapshot */}
      <section className="space-y-3.5">
        <SectionHeader
          title="Installed on This Device"
          icon={<CheckCircle2 className="w-4 h-4 text-[var(--status-success-fg)]" />}
        />
        {installed.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {installed.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<CheckCircle2 className="w-5 h-5" />}
            title="No Installed WinGet Software Synced Yet"
            description={
              isDesktop
                ? 'Click Sync WinGet in the top bar or install an application from Explore to track local software.'
                : 'In desktop mode, AppHub automatically detects applications managed by WinGet and Windows registries.'
            }
            action={
              <Button size="sm" variant="secondary" onClick={onNavigateToDiscover}>
                Browse Explore Catalog
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
};
