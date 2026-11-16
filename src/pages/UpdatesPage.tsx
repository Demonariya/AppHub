import React, { useState, useEffect, useRef } from 'react';
import { Package, TaskAction, InstallationTask } from '../types';
import {
  ArrowUpCircle,
  RefreshCw,
  Pin,
  CheckCircle2,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { AppIconImage } from '../components/common/AppIconImage';
import { formatBytes, getPackageKey } from '../services/catalog';
import { PageHeader, Button, StatusBadge, ErrorState, EmptyState } from '../components/ui';

interface UpdatesPageProps {
  packages: Package[];
  activeTasks?: InstallationTask[];
  queue?: InstallationTask[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction, options?: any) => void;
  onUpdateAll: (selectedPackages: Package[]) => void;
  onPinPackage: (pkg: Package, pin: boolean) => Promise<void> | void;
  onExcludePackage: (pkg: Package, exclude: boolean) => void;
  onScanUpdates: () => void;
  isScanning?: boolean;
  pinError?: string | null;
}

export const UpdatesPage: React.FC<UpdatesPageProps> = ({
  packages,
  activeTasks = [],
  queue = [],
  onOpenDetails,
  onActionClick,
  onUpdateAll,
  onPinPackage,
  onExcludePackage,
  onScanUpdates,
  isScanning = false,
  pinError = null,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pinningId, setPinningId] = useState<string | null>(null);
  const prevIdsRef = useRef<Set<string>>(new Set());

  const updateList = packages.filter(
    p =>
      !p.isExternal &&
      p.isInstalled &&
      p.installedVersion &&
      p.latestVersion &&
      p.installedVersion !== p.latestVersion
  );

  const pinnedList = packages.filter(p => p.isPinned);

  useEffect(() => {
    const currentKeys = new Set(
      updateList.map(p => p.packageKey || getPackageKey(p.id, p.source))
    );
    setSelectedIds(prev => {
      const next = new Set<string>();
      for (const key of prev) {
        if (currentKeys.has(key)) {
          next.add(key);
        }
      }
      for (const pkg of updateList) {
        const key = pkg.packageKey || getPackageKey(pkg.id, pkg.source);
        if (!prevIdsRef.current.has(key) && !pkg.isExcludedFromUpdates && !pkg.isPinned) {
          next.add(key);
        }
      }
      return next;
    });
    prevIdsRef.current = currentKeys;
  }, [packages]);

  const knownDownloadBytes = updateList
    .filter(
      p =>
        selectedIds.has(p.packageKey || getPackageKey(p.id, p.source)) &&
        (p.downloadSizeBytes || p.sizeBytes)
    )
    .reduce((sum, p) => sum + (p.downloadSizeBytes || p.sizeBytes || 0), 0);

  const toggleSelect = (pkgKey: string) => {
    const next = new Set(selectedIds);
    if (next.has(pkgKey)) next.delete(pkgKey);
    else next.add(pkgKey);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === updateList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(updateList.map(p => p.packageKey || getPackageKey(p.id, p.source))));
    }
  };

  const handleUpdateAllSelected = () => {
    const toUpdate = updateList.filter(p =>
      selectedIds.has(p.packageKey || getPackageKey(p.id, p.source))
    );
    if (toUpdate.length > 0) {
      onUpdateAll(toUpdate);
    }
  };

  const handleTogglePin = async (pkg: Package, pin: boolean) => {
    const pkgKey = pkg.packageKey || getPackageKey(pkg.id, pkg.source);
    setPinningId(pkgKey);
    try {
      await onPinPackage(pkg, pin);
    } finally {
      setPinningId(null);
    }
  };

  const getPackageLiveTask = (pkg: Package) => {
    const idLower = pkg.id.toLowerCase();
    const srcLower = (pkg.source || 'winget').toLowerCase();
    const matchTask = (t: InstallationTask) =>
      t.packageId.toLowerCase() === idLower &&
      (!t.source || t.source.toLowerCase() === srcLower);
    return activeTasks.find(matchTask) || queue.find(matchTask);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Update Center"
        subtitle="Review available WinGet upgrades, pin package versions, and run batch updates."
        actions={
          <>
            <Button
              size="md"
              variant="secondary"
              onClick={onScanUpdates}
              disabled={isScanning}
              leftIcon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-[var(--accent-primary)]' : ''}`}
                />
              }
            >
              {isScanning ? 'Checking WinGet...' : 'Scan for Updates'}
            </Button>

            {updateList.length > 0 && (
              <Button
                size="md"
                variant="warning"
                onClick={handleUpdateAllSelected}
                disabled={selectedIds.size === 0}
                leftIcon={<ArrowUpCircle className="w-3.5 h-3.5" />}
              >
                Update Selected ({selectedIds.size})
              </Button>
            )}
          </>
        }
      />

      {pinError && <ErrorState title="Version Pin Failed" message={pinError} />}

      {updateList.length > 0 ? (
        <div className="space-y-4">
          {/* Selection Bar */}
          <div className="px-4 py-3 bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[10px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.size === updateList.length && updateList.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
              />
              <span className="text-[var(--text-primary)] font-medium">
                Select All Available Updates
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
              {knownDownloadBytes > 0 && (
                <>
                  <span>
                    Known payload:{' '}
                    <strong className="text-[var(--text-primary)]">
                      {formatBytes(knownDownloadBytes)}
                    </strong>
                  </span>
                  <span className="text-[var(--text-muted)]">·</span>
                </>
              )}
              <span>
                {selectedIds.size} of {updateList.length} selected
              </span>
            </div>
          </div>

          {/* Updates Table/Rows */}
          <div className="rounded-[12px] border border-[var(--border-subtle)] overflow-hidden divide-y divide-[var(--border-subtle)] bg-[var(--surface-panel)]">
            {updateList.map(pkg => {
              const pkgKey = pkg.packageKey || getPackageKey(pkg.id, pkg.source);
              const isSelected = selectedIds.has(pkgKey);
              const isPinning = pinningId === pkgKey;
              const liveTask = getPackageLiveTask(pkg);

              return (
                <div
                  key={pkgKey}
                  onClick={() => onOpenDetails(pkg)}
                  className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/65 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(pkgKey)}
                      aria-label={`Select ${pkg.name} for update`}
                      className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
                    />

                    <div onClick={() => onOpenDetails(pkg)} className="cursor-pointer">
                      <AppIconImage pkg={pkg} size="md" />
                    </div>

                    <div className="min-w-0 cursor-pointer" onClick={() => onOpenDetails(pkg)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          {pkg.name}
                        </span>
                        {pkg.verified && (
                          <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        )}
                        {pkg.isPinned && (
                          <span className="text-[11px] font-mono text-[var(--accent-primary)] inline-flex items-center gap-0.5">
                            <Pin className="w-3 h-3" /> Pinned
                          </span>
                        )}
                        {liveTask && (
                          <StatusBadge
                            status={liveTask.status === 'queued' ? 'queued' : 'running'}
                            compact
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] font-mono flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span>{pkg.id}</span>
                        {(pkg.formattedDownloadSize || pkg.formattedSize) && (
                          <>
                            <span>·</span>
                            <span className="text-[var(--text-secondary)]">
                              {pkg.formattedDownloadSize || pkg.formattedSize}
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{pkg.source}</span>
                      </div>
                    </div>
                  </div>

                  {/* Version Comparison */}
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums shrink-0">
                    <span className="text-[var(--text-secondary)]">v{pkg.installedVersion}</span>
                    <span className="text-[var(--text-muted)]">→</span>
                    <span className="text-[var(--status-warning-fg)] font-semibold">
                      v{pkg.latestVersion}
                    </span>
                  </div>

                  {/* Row Actions */}
                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant={pkg.isExcludedFromUpdates ? 'secondary' : 'ghost'}
                      onClick={() => onExcludePackage(pkg, !pkg.isExcludedFromUpdates)}
                      title={
                        pkg.isExcludedFromUpdates
                          ? 'Include in bulk updates'
                          : 'Skip in bulk selection'
                      }
                    >
                      {pkg.isExcludedFromUpdates ? 'Skipped' : 'Skip'}
                    </Button>

                    <button
                      type="button"
                      onClick={() => handleTogglePin(pkg, !pkg.isPinned)}
                      disabled={isPinning}
                      aria-label={pkg.isPinned ? `Unpin ${pkg.name}` : `Pin ${pkg.name}`}
                      title={
                        pkg.isPinned
                          ? 'Unpin package version (winget pin remove)'
                          : 'Pin package version (winget pin add)'
                      }
                      className={`w-7 h-7 inline-flex items-center justify-center rounded-[6px] border transition-colors cursor-pointer disabled:opacity-45 ${
                        pkg.isPinned
                          ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border-[var(--accent-border)]'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border-[var(--border-subtle)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      {isPinning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Pin className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <Button
                      size="sm"
                      variant="warning"
                      disabled={Boolean(liveTask)}
                      leftIcon={<ArrowUpCircle className="w-3.5 h-3.5" />}
                      onClick={() => onActionClick(pkg, 'update')}
                    >
                      {liveTask ? 'Queued' : 'Update'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircle2 className="w-6 h-6 text-[var(--status-success-fg)]" />}
          title="All Software Is Up to Date"
          description="Installed WinGet packages match the latest versions reported by your active WinGet sources."
          action={
            <Button
              size="md"
              variant="secondary"
              onClick={onScanUpdates}
              loading={isScanning}
            >
              Check Again
            </Button>
          }
        />
      )}

      {/* Pinned Packages */}
      {pinnedList.length > 0 && (
        <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Pinned Packages (Excluded from Automated Upgrades)
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedList.map(pkg => (
              <div
                key={pkg.packageKey || `${pkg.source}::${pkg.id}`}
                className="p-4 rounded-[10px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {pkg.name}
                  </div>
                  <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                    Pinned at v{pkg.pinnedVersion || pkg.installedVersion || pkg.version}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleTogglePin(pkg, false)}
                  disabled={pinningId === (pkg.packageKey || getPackageKey(pkg.id, pkg.source))}
                >
                  Unpin
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
