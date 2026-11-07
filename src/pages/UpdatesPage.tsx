import React, { useState, useMemo } from 'react';
import { Package, TaskAction } from '../types';
import {
  ArrowUpCircle,
  RefreshCw,
  Pin,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Check,
  RotateCw,
  HardDrive,
  Download,
} from 'lucide-react';
import { AppIconImage } from '../components/common/AppIconImage';
import { formatBytes } from '../services/catalog';

interface UpdatesPageProps {
  packages: Package[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction, options?: any) => void;
  onUpdateAll: (selectedPackages: Package[]) => void;
  onPinPackage: (pkg: Package, pin: boolean) => void;
  onExcludePackage: (pkg: Package, exclude: boolean) => void;
  onScanUpdates: () => void;
  isScanning?: boolean;
}

export const UpdatesPage: React.FC<UpdatesPageProps> = ({
  packages,
  onOpenDetails,
  onActionClick,
  onUpdateAll,
  onPinPackage,
  onExcludePackage,
  onScanUpdates,
  isScanning = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Apps with updates available
  const updateList = packages.filter(
    p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
  );

  const pinnedList = packages.filter(p => p.isPinned);

  // Initialize selected packages with non-excluded apps
  React.useEffect(() => {
    const nonExcluded = new Set(
      updateList.filter(p => !p.isExcludedFromUpdates && !p.isPinned).map(p => p.id)
    );
    setSelectedIds(nonExcluded);
  }, [packages]);

  // Compute total download and disk storage metrics for selected packages
  const { totalDownloadBytes, totalInstalledBytes } = useMemo(() => {
    const selected = updateList.filter(p => selectedIds.has(p.id));
    const dlBytes = selected.reduce(
      (sum, p) => sum + (p.downloadSizeBytes || p.sizeBytes || 45 * 1024 * 1024),
      0
    );
    const instBytes = selected.reduce(
      (sum, p) => sum + (p.installedSizeBytes || (p.downloadSizeBytes ? Math.round(p.downloadSizeBytes * 3.4) : 150 * 1024 * 1024)),
      0
    );
    return {
      totalDownloadBytes: dlBytes,
      totalInstalledBytes: instBytes,
    };
  }, [updateList, selectedIds]);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === updateList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(updateList.map(p => p.id)));
    }
  };

  const handleUpdateAllSelected = () => {
    const toUpdate = updateList.filter(p => selectedIds.has(p.id));
    onUpdateAll(toUpdate);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Update Center</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Detect and install newer versions published to Microsoft WinGet.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onScanUpdates}
            disabled={isScanning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-sky-400' : ''}`} />
            <span>{isScanning ? 'Checking WinGet...' : 'Scan for Updates'}</span>
          </button>

          {updateList.length > 0 && (
            <button
              onClick={handleUpdateAllSelected}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Update Selected ({selectedIds.size})</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Updates Section */}
      {updateList.length > 0 ? (
        <div className="space-y-4">
          {/* Storage & Action strip */}
          <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-neutral-400">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.size === updateList.length && updateList.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 cursor-pointer"
              />
              <span className="text-neutral-200 font-medium">Select All Updates</span>
            </label>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-neutral-300 flex items-center gap-1">
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Total download: <strong className="text-white font-semibold">{formatBytes(totalDownloadBytes)}</strong></span>
              </span>
              <span className="text-neutral-600">·</span>
              <span className="text-neutral-300 flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-amber-400" />
                <span>Required disk space: <strong className="text-white font-semibold">{formatBytes(totalInstalledBytes)}</strong></span>
              </span>
              <span className="text-neutral-600">·</span>
              <span className="text-neutral-400">
                {selectedIds.size} of {updateList.length} selected
              </span>
            </div>
          </div>

          {/* List of pending updates */}
          <div className="rounded-xl border border-neutral-800 overflow-hidden divide-y divide-neutral-800/80 bg-neutral-950/40">
            {updateList.map(pkg => {
              const isSelected = selectedIds.has(pkg.id);

              return (
                <div
                  key={pkg.id}
                  className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:bg-neutral-900/60 transition-colors"
                >
                  {/* Left: Checkbox + Icon + Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(pkg.id)}
                      className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />

                    <AppIconImage pkg={pkg} size="md" />

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs text-neutral-100">{pkg.name}</span>
                        {pkg.verified && <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />}
                        {pkg.isPinned && (
                          <span className="text-[10px] font-mono text-purple-400 flex items-center gap-0.5">
                            <Pin className="w-2.5 h-2.5" /> Pinned
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono flex flex-wrap items-center gap-2 mt-0.5">
                        <span className="text-neutral-500">{pkg.id}</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-300">Download: {pkg.formattedDownloadSize || pkg.formattedSize}</span>
                        <span className="text-neutral-600">·</span>
                        <span className="text-neutral-400">Needs {pkg.formattedInstalledSize || '~150 MB'} disk space</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Version comparison (Tabular numerals) */}
                  <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
                    <div className="text-neutral-400">
                      Current: <span className="text-neutral-300">v{pkg.installedVersion}</span>
                    </div>
                    <span className="text-neutral-600">→</span>
                    <div className="text-amber-400 font-semibold">
                      New: <span>v{pkg.latestVersion}</span>
                    </div>
                  </div>

                  {/* Right Actions: Single update + Pin button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onPinPackage(pkg, !pkg.isPinned)}
                      title={pkg.isPinned ? 'Unpin package version' : 'Pin to prevent automated updates (winget pin)'}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        pkg.isPinned
                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                          : 'text-neutral-400 hover:text-neutral-200 border-neutral-800 hover:bg-neutral-800'
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onActionClick(pkg, 'update')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors shadow-sm"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      <span>Update</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State: All Up to Date */
        <div className="py-20 text-center space-y-3 bg-neutral-900/30 rounded-2xl border border-neutral-800/60 p-8">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
          <h2 className="text-base font-semibold text-neutral-100">All Software Is Up to Date</h2>
          <p className="text-xs text-neutral-400 max-w-md mx-auto">
            Your installed applications match the latest package versions published to the WinGet repository.
          </p>
          <button
            onClick={onScanUpdates}
            className="px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Check Again
          </button>
        </div>
      )}

      {/* Pinned Packages Reference */}
      {pinnedList.length > 0 && (
        <div className="pt-6 border-t border-neutral-800 space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-neutral-200">
              Pinned Packages (Excluded from Automated Upgrades)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pinnedList.map(pkg => (
              <div
                key={pkg.id}
                className="p-3 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-between"
              >
                <div>
                  <div className="text-xs font-medium text-neutral-200">{pkg.name}</div>
                  <div className="text-[11px] font-mono text-neutral-400">
                    Pinned version: v{pkg.installedVersion || pkg.version}
                  </div>
                </div>
                <button
                  onClick={() => onPinPackage(pkg, false)}
                  className="text-xs text-purple-400 hover:text-purple-300 underline"
                >
                  Unpin
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
