import React, { useState, useMemo } from 'react';
import { Package, TaskAction } from '../types';
import { AppListItem } from '../components/common/AppListItem';
import { AppCard } from '../components/common/AppCard';
import { LayoutGrid, List, HardDrive, Share2, RefreshCw } from 'lucide-react';
import {
  PageHeader,
  SearchInput,
  SegmentedTabs,
  FilterSelect,
  Button,
  EmptyState,
} from '../components/ui';

interface InstalledPageProps {
  packages: Package[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  onExportManifest: () => void;
  onRefreshInstalled?: () => void;
  isRefreshing?: boolean;
}

export const InstalledPage: React.FC<InstalledPageProps> = ({
  packages,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  onExportManifest,
  onRefreshInstalled,
  isRefreshing = false,
}) => {
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'winget' | 'external'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'source' | 'updates'>('name');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const installedPackages = useMemo(() => packages.filter(p => p.isInstalled), [packages]);
  const wingetManagedCount = installedPackages.filter(p => !p.isExternal).length;
  const externalCount = installedPackages.filter(p => p.isExternal).length;
  const pendingUpdatesCount = installedPackages.filter(
    p => !p.isExternal && p.installedVersion && p.installedVersion !== p.latestVersion
  ).length;

  const filtered = useMemo(() => {
    let list = installedPackages.filter(p => {
      if (sourceFilter === 'winget' && p.isExternal) return false;
      if (sourceFilter === 'external' && !p.isExternal) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.publisher.toLowerCase().includes(q)
      );
    });

    list = [...list].sort((a, b) => {
      if (sortBy === 'updates') {
        const aUpd = a.installedVersion && a.installedVersion !== a.latestVersion ? 0 : 1;
        const bUpd = b.installedVersion && b.installedVersion !== b.latestVersion ? 0 : 1;
        if (aUpd !== bUpd) return aUpd - bUpd;
      }
      if (sortBy === 'source') {
        const sCmp = (a.isExternal ? 'local' : a.source).localeCompare(
          b.isExternal ? 'local' : b.source
        );
        if (sCmp !== 0) return sCmp;
      }
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [installedPackages, sourceFilter, query, sortBy]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Installed Applications"
        subtitle="Software detected on this Windows system via WinGet and local installer registries."
        actions={
          <>
            {onRefreshInstalled && (
              <Button
                size="md"
                variant="secondary"
                onClick={onRefreshInstalled}
                disabled={isRefreshing}
                leftIcon={
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[var(--accent-primary)]' : ''}`}
                  />
                }
              >
                {isRefreshing ? 'Scanning System...' : 'Refresh Inventory'}
              </Button>
            )}
            <Button
              size="md"
              variant="secondary"
              onClick={onExportManifest}
              disabled={wingetManagedCount === 0}
              leftIcon={<Share2 className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
            >
              Export Manifest
            </Button>
          </>
        }
      />

      {/* Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-xs text-[var(--text-secondary)]">Total Detected</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-[var(--text-primary)] tabular-nums">
            {installedPackages.length} apps
          </div>
        </div>

        <div className="p-4 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-xs text-[var(--text-secondary)]">WinGet Managed</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-[var(--accent-primary)] tabular-nums">
            {wingetManagedCount} apps
          </div>
        </div>

        <div className="p-4 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-xs text-[var(--text-secondary)]">External / Local</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-[var(--text-primary)] tabular-nums">
            {externalCount} apps
          </div>
        </div>

        <div className="p-4 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] space-y-1">
          <div className="text-xs text-[var(--text-secondary)]">Pending Updates</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-[var(--status-warning-fg)] tabular-nums">
            {pendingUpdatesCount} available
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search installed applications..."
            className="flex-1 min-w-[220px] max-w-md"
          />

          <SegmentedTabs
            value={sourceFilter}
            onChange={setSourceFilter}
            ariaLabel="Filter installed software source"
            options={[
              { id: 'all', label: 'All', count: installedPackages.length },
              { id: 'winget', label: 'WinGet', count: wingetManagedCount },
              { id: 'external', label: 'External', count: externalCount },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterSelect
            label="Sort"
            value={sortBy}
            onChange={v => setSortBy(v as 'name' | 'source' | 'updates')}
            options={[
              { value: 'name', label: 'Name (A–Z)' },
              { value: 'updates', label: 'Updates First' },
              { value: 'source', label: 'Source' },
            ]}
          />

          <div className="flex items-center bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded-[8px] p-0.5">
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
          </div>
        </div>
      </div>

      {/* Installed Content */}
      {filtered.length > 0 ? (
        viewMode === 'list' ? (
          <div className="rounded-[12px] border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)] bg-[var(--surface-panel)]">
            <div className="hidden md:flex items-center justify-between gap-4 px-4 py-2.5 bg-[var(--surface-subtle)] text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              <span className="flex-1">Application Name &amp; ID</span>
              <div className="flex items-center gap-6 shrink-0 font-mono">
                <span className="w-24">Source</span>
                <span className="w-28 text-right">Installed</span>
                <span className="w-28 text-right">Latest</span>
              </div>
              <span className="w-36 text-right">Actions</span>
            </div>

            {filtered.map(pkg => (
              <AppListItem
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        )
      ) : (
        <EmptyState
          icon={<HardDrive className="w-5 h-5" />}
          title={
            query || sourceFilter !== 'all'
              ? 'No Matching Installed Applications'
              : 'No Installed Applications Detected'
          }
          description={
            query || sourceFilter !== 'all'
              ? 'Try clearing your search or switching source tabs.'
              : 'Applications detected via winget list or installed through AppHub will appear here.'
          }
          action={
            query || sourceFilter !== 'all' ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setQuery('');
                  setSourceFilter('all');
                }}
              >
                Reset Filters
              </Button>
            ) : undefined
          }
        />
      )}
    </div>
  );
};
