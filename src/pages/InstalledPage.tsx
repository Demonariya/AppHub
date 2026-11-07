import React, { useState } from 'react';
import { Package, TaskAction } from '../types';
import { AppListItem } from '../components/common/AppListItem';
import { AppCard } from '../components/common/AppCard';
import {
  CheckSquare,
  Search,
  Download,
  Trash2,
  RotateCw,
  ExternalLink,
  LayoutGrid,
  List,
  HardDrive,
  Share2,
} from 'lucide-react';

interface InstalledPageProps {
  packages: Package[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onExportManifest: () => void;
}

export const InstalledPage: React.FC<InstalledPageProps> = ({
  packages,
  onOpenDetails,
  onActionClick,
  onExportManifest,
}) => {
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const installedPackages = packages.filter(p => p.isInstalled);

  const filtered = installedPackages.filter(p => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.publisher.toLowerCase().includes(q)
    );
  });

  const totalDownloadBytes = installedPackages.reduce((acc, p) => acc + (p.downloadSizeBytes || p.sizeBytes || 0), 0);
  const totalDiskBytes = installedPackages.reduce((acc, p) => acc + (p.installedSizeBytes || Math.round((p.sizeBytes || 0) * 3.4)), 0);
  const formattedDownloadSize = `${(totalDownloadBytes / 1073741824).toFixed(2)} GB`;
  const formattedDiskSize = `${(totalDiskBytes / 1073741824).toFixed(2)} GB`;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Installed Applications</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Software registered on this system via WinGet and Windows Installer.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onExportManifest}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:text-white rounded-lg transition-colors"
          >
            <Share2 className="w-3.5 h-3.5 text-sky-400" />
            <span>Export Manifest (winget export)</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1">
          <div className="text-xs text-neutral-400">Installed Packages</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-neutral-100 tabular-nums">
            {installedPackages.length} apps
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1">
          <div className="text-xs text-neutral-400">Disk Space Occupied</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-sky-400 tabular-nums">
            {formattedDiskSize}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1">
          <div className="text-xs text-neutral-400">Total Download Size</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-neutral-300 tabular-nums">
            {formattedDownloadSize}
          </div>
        </div>

        <div className="p-4 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-1">
          <div className="text-xs text-neutral-400">Pending Updates</div>
          <div className="text-lg sm:text-xl font-bold font-mono text-amber-400 tabular-nums">
            {installedPackages.filter(p => p.installedVersion && p.installedVersion !== p.latestVersion).length} available
          </div>
        </div>
      </div>

      {/* Search & View Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search installed applications..."
            className="w-full pl-9 pr-3 py-1.5 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-200 placeholder-neutral-500 focus:outline-none"
          />
        </div>

        <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded text-neutral-400 ${viewMode === 'list' ? 'bg-neutral-800 text-white' : ''}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded text-neutral-400 ${viewMode === 'grid' ? 'bg-neutral-800 text-white' : ''}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Installed List */}
      {filtered.length > 0 ? (
        viewMode === 'list' ? (
          <div className="rounded-xl border border-neutral-800/80 overflow-hidden divide-y divide-neutral-800/60 bg-neutral-950/40">
            {/* Table Header */}
            <div className="hidden md:flex items-center justify-between gap-4 px-4 py-2 bg-neutral-900/80 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
              <span className="flex-1">Application Name & ID</span>
              <div className="flex items-center gap-6 shrink-0 font-mono">
                <span className="w-24">Category</span>
                <span className="w-28 text-right">Installed</span>
                <span className="w-28 text-right">Latest</span>
                <span className="w-20 text-right">Size</span>
              </div>
              <span className="w-28 text-right">Actions</span>
            </div>

            {filtered.map(pkg => (
              <AppListItem
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
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
              />
            ))}
          </div>
        )
      ) : (
        <div className="py-16 text-center space-y-2">
          <HardDrive className="w-8 h-8 text-neutral-600 mx-auto" />
          <p className="text-sm text-neutral-300">No installed applications found</p>
          <p className="text-xs text-neutral-500">Applications installed through AppHub or WinGet will appear here.</p>
        </div>
      )}
    </div>
  );
};
