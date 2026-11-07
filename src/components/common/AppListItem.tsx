import React from 'react';
import { Package, TaskAction } from '../../types';
import { Check, ArrowUpCircle, Download, ShieldCheck, MoreVertical, ExternalLink } from 'lucide-react';
import { AppIconImage } from './AppIconImage';

interface AppListItemProps {
  pkg: Package;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  isActionActive?: boolean;
}

export const AppListItem: React.FC<AppListItemProps> = ({
  pkg,
  onOpenDetails,
  onActionClick,
  isActionActive = false,
}) => {
  const hasUpdate = pkg.isInstalled && pkg.installedVersion && pkg.installedVersion !== pkg.latestVersion;

  return (
    <div
      onClick={() => onOpenDetails(pkg)}
      className="group flex items-center justify-between gap-4 px-4 py-3 bg-neutral-900/40 hover:bg-neutral-900/90 border-b border-neutral-800/60 transition-colors cursor-pointer"
    >
      {/* Left: Icon + Title + Package ID */}
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <AppIconImage pkg={pkg} size="sm" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-neutral-100 group-hover:text-sky-300 transition-colors truncate">
              {pkg.name}
            </span>
            {pkg.verified && (
              <span title="Verified Publisher">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
            <span className="truncate">{pkg.id}</span>
            <span className="text-neutral-600">·</span>
            <span className="text-neutral-300">{pkg.formattedDownloadSize || pkg.formattedSize}</span>
            <span className="text-neutral-500 hidden sm:inline">(needs {pkg.formattedInstalledSize || '~150 MB'} disk)</span>
          </div>
        </div>
      </div>

      {/* Middle: Category & Versions & Size (Tabular figures) */}
      <div className="hidden md:flex items-center gap-6 text-xs text-neutral-400 font-mono tabular-nums shrink-0">
        <div className="w-24 truncate">{pkg.category}</div>
        
        <div className="w-24 text-right">
          {pkg.isInstalled ? (
            <span>v{pkg.installedVersion}</span>
          ) : (
            <span className="text-neutral-600">—</span>
          )}
        </div>

        <div className="w-24 text-right text-neutral-300">
          <span>v{pkg.latestVersion}</span>
        </div>

        <div className="w-32 text-right text-neutral-300 font-mono">
          <div>{pkg.formattedDownloadSize || pkg.formattedSize}</div>
          <div className="text-[10px] text-neutral-500">req. {pkg.formattedInstalledSize || '~150 MB'}</div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
        {hasUpdate ? (
          <button
            onClick={() => onActionClick(pkg, 'update')}
            disabled={isActionActive}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors"
          >
            <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Update</span>
          </button>
        ) : pkg.isInstalled ? (
          <button
            onClick={() => onActionClick(pkg, 'uninstall')}
            disabled={isActionActive}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-400 hover:text-red-300 hover:bg-red-500/10 border border-neutral-700/80 hover:border-red-500/30 rounded-md transition-colors"
          >
            <span>Uninstall</span>
          </button>
        ) : (
          <button
            onClick={() => onActionClick(pkg, 'install')}
            disabled={isActionActive}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-100 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-md transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>Get</span>
          </button>
        )}

        <button
          onClick={() => onOpenDetails(pkg)}
          title="Details"
          className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
