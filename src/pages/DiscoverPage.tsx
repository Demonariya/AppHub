import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Package,
  PackageSource,
  TaskAction,
  Architecture,
  CategoryType,
  CatalogCacheStats,
  CatalogSyncProgress,
  CatalogSyncResult,
  CatalogSyncRunRecord,
} from '../types';
import { AppCard } from '../components/common/AppCard';
import { AppListItem } from '../components/common/AppListItem';
import { CatalogSyncBanner } from '../components/common/CatalogSyncBanner';
import { CATEGORIES_LIST, getPackageKey } from '../services/catalog';
import { wingetEngine } from '../services/wingetEngine';
import { storage } from '../services/storage';
import { isTauriEnvironment } from '../services/tauriBridge';
import {
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Search,
  History,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import {
  PageHeader,
  SearchInput,
  FilterSelect,
  Button,
  EmptyState,
  ErrorState,
  SkeletonGrid,
} from '../components/ui';

interface DiscoverPageProps {
  packages: Package[];
  sources: PackageSource[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  onPackageEnriched?: (pkgId: string, source: string, details: Partial<Package>) => void;
  initialCategory?: CategoryType | null;
  isSyncing: boolean;
  syncProgress: CatalogSyncProgress | null;
  lastSyncResult: CatalogSyncResult | null;
  syncHistory: CatalogSyncRunRecord[];
  catalogStats: CatalogCacheStats;
  onStartSync: (targetSources?: string[]) => void;
  onCancelSync: () => void;
  onAcceptAgreementsAndSync: () => void;
}

export const DiscoverPage: React.FC<DiscoverPageProps> = ({
  packages,
  sources,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  onPackageEnriched,
  initialCategory = null,
  isSyncing,
  syncProgress,
  lastSyncResult,
  syncHistory,
  catalogStats,
  onStartSync,
  onCancelSync,
  onAcceptAgreementsAndSync,
}) => {
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    storage.getSearchHistory()
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'All');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'releaseDate' | 'size'>('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const [remoteResults, setRemoteResults] = useState<Package[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    setSelectedCategory(initialCategory || 'All');
    setCurrentPage(1);
  }, [initialCategory]);

  const executeLiveSearch = useCallback(async (searchText: string) => {
    const trimmed = searchText.trim();
    const seq = ++searchSeqRef.current;

    if (!isTauriEnvironment() || trimmed.length < 2) {
      setRemoteResults(null);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = await wingetEngine.searchPackages(trimmed);
      if (seq !== searchSeqRef.current) return;
      storage.addSearchQuery(trimmed);
      setRecentSearches(storage.getSearchHistory());
      setRemoteResults(results);
      setIsSearching(false);
    } catch (err: any) {
      if (seq !== searchSeqRef.current) return;
      setSearchError(err?.message || String(err));
      setRemoteResults(null);
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!isTauriEnvironment() || trimmed.length < 2) {
      searchSeqRef.current += 1;
      setRemoteResults(null);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void executeLiveSearch(trimmed);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [query, executeLiveSearch]);

  const mergedCatalog = useMemo(() => {
    if (!remoteResults) return packages;

    const localByKey = new Map<string, Package>();
    for (const p of packages) {
      localByKey.set(getPackageKey(p.id, p.source), p);
    }

    const combined: Package[] = [];
    const seen = new Set<string>();

    for (const remote of remoteResults) {
      const key = getPackageKey(remote.id, remote.source);
      seen.add(key);
      const local = localByKey.get(key);
      if (local) {
        combined.push({
          ...local,
          version: remote.latestVersion || local.version,
          latestVersion: remote.latestVersion || local.latestVersion,
        });
      } else {
        combined.push(remote);
      }
    }

    const q = query.toLowerCase().trim();
    for (const local of packages) {
      const key = getPackageKey(local.id, local.source);
      if (seen.has(key)) continue;
      if (
        local.name.toLowerCase().includes(q) ||
        local.id.toLowerCase().includes(q) ||
        (local.publisher || '').toLowerCase().includes(q) ||
        local.tags.some(t => t.toLowerCase().includes(q)) ||
        (local.description || '').toLowerCase().includes(q)
      ) {
        combined.push(local);
        seen.add(key);
      }
    }

    return combined;
  }, [packages, remoteResults, query]);

  const filtered = useMemo(() => {
    let result = [...mergedCatalog];

    if (query.trim() && !remoteResults) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.publisher || '').toLowerCase().includes(q) ||
          p.tags.some(t => t.toLowerCase().includes(q)) ||
          (p.description || '').toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }

    if (selectedSource !== 'all') {
      result = result.filter(p => p.source.toLowerCase() === selectedSource.toLowerCase());
    }

    if (selectedArch !== 'all') {
      result = result.filter(p => p.architectures.includes(selectedArch as Architecture));
    }

    if (selectedStatus === 'installed') {
      result = result.filter(p => p.isInstalled);
    } else if (selectedStatus === 'available') {
      result = result.filter(p => !p.isInstalled);
    } else if (selectedStatus === 'updates') {
      result = result.filter(
        p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
      );
    }

    if (sortBy === 'name') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'releaseDate') {
      result.sort((a, b) => (b.releaseDate || '').localeCompare(a.releaseDate || ''));
    } else if (sortBy === 'size') {
      result.sort(
        (a, b) =>
          (b.downloadSizeBytes || b.sizeBytes || b.installedSizeBytes || 0) -
          (a.downloadSizeBytes || a.sizeBytes || a.installedSizeBytes || 0)
      );
    }

    return result;
  }, [
    mergedCatalog,
    remoteResults,
    query,
    selectedCategory,
    selectedSource,
    selectedArch,
    selectedStatus,
    sortBy,
  ]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage),
    [filtered, currentPage]
  );

  // Lazy bounded-concurrency `winget show` enrichment for currently visible summary cards
  useEffect(() => {
    if (!isTauriEnvironment() || isSyncing || paginated.length === 0) return;
    let cancelled = false;

    for (const pkg of paginated) {
      if (pkg.isExternal || pkg.metadataStatus === 'enriched') continue;
      if (!wingetEngine.isValidPackageId(pkg.id)) continue;

      void wingetEngine.metadataQueue.enqueue(pkg, {
        onEnriched: (_pkgKey, details) => {
          if (cancelled) return;
          storage.updatePackage(pkg.id, details, pkg.source);
          onPackageEnriched?.(pkg.id, pkg.source, details);
        },
      });
    }

    return () => {
      cancelled = true;
      wingetEngine.metadataQueue.cancelAll();
    };
  }, [paginated, isSyncing, onPackageEnriched]);

  const dynamicSourceOptions = useMemo(() => {
    const names = new Set<string>();
    for (const s of sources) {
      if (s.name) names.add(s.name);
    }
    for (const p of packages) {
      if (p.source && p.source !== 'external') names.add(p.source);
    }
    const opts = [{ value: 'all', label: 'All Sources' }];
    for (const name of Array.from(names).sort((a, b) => a.localeCompare(b))) {
      opts.push({ value: name, label: name });
    }
    if (packages.some(p => p.source === 'external' || p.isExternal)) {
      opts.push({ value: 'external', label: 'External' });
    }
    return opts;
  }, [sources, packages]);

  const handleResetFilters = () => {
    setQuery('');
    setSelectedCategory('All');
    setSelectedSource('all');
    setSelectedArch('all');
    setSelectedStatus('all');
    setSortBy('relevance');
    setCurrentPage(1);
    setRemoteResults(null);
    setSearchError(null);
  };

  const hasActiveFilters = Boolean(
    query ||
      selectedCategory !== 'All' ||
      selectedSource !== 'all' ||
      selectedArch !== 'all' ||
      selectedStatus !== 'all' ||
      sortBy !== 'relevance'
  );

  const isDesktop = isTauriEnvironment();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Explore Packages"
        subtitle="Browse synchronized WinGet packages from your configured Windows sources or query live."
        actions={
          <div className="flex items-center bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded-[8px] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label="Grid view"
              aria-pressed={viewMode === 'grid'}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label="List view"
              aria-pressed={viewMode === 'list'}
              className={`p-1.5 rounded-[6px] transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] shadow-xs'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        }
      />

      {isDesktop && (
        <CatalogSyncBanner
          compact
          isSyncing={isSyncing}
          syncProgress={syncProgress}
          lastSyncResult={lastSyncResult}
          syncHistory={syncHistory}
          catalogStats={catalogStats}
          onStartSync={onStartSync}
          onCancelSync={onCancelSync}
          onAcceptAgreementsAndSync={onAcceptAgreementsAndSync}
        />
      )}

      {/* Search & Filter Toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <SearchInput
            value={query}
            onChange={v => {
              setQuery(v);
              setCurrentPage(1);
            }}
            loading={isSearching}
            placeholder={
              isDesktop
                ? 'Filter synchronized catalog or query live WinGet repository (min 2 chars)...'
                : 'Search synchronized packages by name, ID, publisher, or tag...'
            }
            className="flex-1"
          />

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect
              label="Sort"
              value={sortBy}
              onChange={v => setSortBy(v as 'relevance' | 'name' | 'releaseDate' | 'size')}
              options={[
                { value: 'relevance', label: 'Relevance' },
                { value: 'name', label: 'Name (A–Z)' },
                { value: 'releaseDate', label: 'Release Date' },
                { value: 'size', label: 'Size (Largest)' },
              ]}
            />
          </div>
        </div>

        {/* Recent Searches Strip */}
        {!query && recentSearches.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] mr-1">
              <History className="w-3 h-3" />
              Recent:
            </span>
            {recentSearches.slice(0, 6).map(term => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setQuery(term);
                  setCurrentPage(1);
                }}
                className="px-2 py-0.5 text-[11px] rounded-[6px] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {term}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                storage.clearSearchHistory();
                setRecentSearches([]);
              }}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] ml-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              Clear
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <FilterSelect
            label="Category"
            value={selectedCategory}
            onChange={v => {
              setSelectedCategory(v);
              setCurrentPage(1);
            }}
            options={[
              { value: 'All', label: 'All Categories' },
              ...CATEGORIES_LIST.map(cat => ({ value: cat, label: cat })),
            ]}
          />

          <FilterSelect
            label="Source"
            mono
            value={selectedSource}
            onChange={v => {
              setSelectedSource(v);
              setCurrentPage(1);
            }}
            options={dynamicSourceOptions}
          />

          <FilterSelect
            label="Arch"
            mono
            value={selectedArch}
            onChange={v => {
              setSelectedArch(v);
              setCurrentPage(1);
            }}
            options={[
              { value: 'all', label: 'Any' },
              { value: 'x64', label: 'x64' },
              { value: 'arm64', label: 'ARM64' },
              { value: 'x86', label: 'x86' },
            ]}
          />

          <FilterSelect
            label="Status"
            value={selectedStatus}
            onChange={v => {
              setSelectedStatus(v);
              setCurrentPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'installed', label: 'Installed' },
              { value: 'available', label: 'Not Installed' },
              { value: 'updates', label: 'Updates Available' },
            ]}
          />

          {hasActiveFilters && (
            <Button size="sm" variant="ghost" onClick={handleResetFilters} className="ml-auto">
              Reset filters
            </Button>
          )}
        </div>
      </div>

      {searchError && (
        <ErrorState
          title="Live WinGet Query Failed"
          message={searchError}
          onRetry={() => executeLiveSearch(query)}
          onDismiss={() => setSearchError(null)}
        />
      )}

      {/* Results Count */}
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-mono tabular-nums pb-2 border-b border-[var(--border-subtle)]">
        <span>
          Showing {paginated.length} of {filtered.length} packages
          {remoteResults !== null && ' (includes live WinGet results)'}
        </span>
        <span>
          Page {currentPage} of {totalPages}
        </span>
      </div>

      {/* Results Area */}
      {(isSearching || isSyncing) && paginated.length === 0 ? (
        <SkeletonGrid count={8} />
      ) : paginated.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginated.map(pkg => (
              <AppCard
                key={pkg.packageKey || `${pkg.source}::${pkg.id}`}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[12px] border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)]">
            {paginated.map(pkg => (
              <AppListItem
                key={pkg.packageKey || `${pkg.source}::${pkg.id}`}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )
      ) : packages.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={<RefreshCw className="w-5 h-5" />}
          title={
            isDesktop
              ? 'No WinGet Packages Synchronized Yet'
              : 'WinGet Catalog Requires Windows Desktop Runtime'
          }
          description={
            isDesktop
              ? 'Run a catalog synchronization to fetch available applications from your configured WinGet sources into the local database.'
              : 'AppHub does not bundle a static application catalog. Launch the Windows desktop app to synchronize packages directly from Microsoft WinGet.'
          }
          action={
            isDesktop ? (
              <Button
                size="md"
                variant="primary"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={() => onStartSync()}
              >
                Synchronize WinGet Catalog
              </Button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon={<Search className="w-5 h-5" />}
          title="No Matching Packages"
          description="No applications matched your search query and active filters. Try clearing filters or searching by package ID."
          action={
            hasActiveFilters ? (
              <Button size="md" variant="secondary" onClick={handleResetFilters}>
                Clear All Filters
              </Button>
            ) : undefined
          }
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-[var(--text-secondary)] font-mono tabular-nums px-3">
            {currentPage} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
