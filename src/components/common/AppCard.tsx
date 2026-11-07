import React from 'react';
import { Package, TaskAction } from '../../types';
import { Check, ArrowUpCircle, Download, ShieldCheck, Star, HardDrive } from 'lucide-react';
import { AppIconImage } from './AppIconImage';

interface AppCardProps {
  pkg: Package;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  isActionActive?: boolean;
}

export const AppCard: React.FC<AppCardProps> = ({
  pkg,
  onOpenDetails,
  onActionClick,
  isActionActive = false,
}) => {
  const hasUpdate = pkg.isInstalled && pkg.installedVersion && pkg.installedVersion !== pkg.latestVersion;

  const handleAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasUpdate) {
      onActionClick(pkg, 'update');
    } else if (pkg.isInstalled) {
      onActionClick(pkg, 'uninstall');
    } else {
      onActionClick(pkg, 'install');
    }
  };

  return (
    <div
      onClick={() => onOpenDetails(pkg)}
      className="group bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700/90 rounded-xl p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between hover:shadow-lg hover:shadow-black/20"
    >
      <div>
        {/* Top: Icon + Title + Publisher */}
        <div className="flex items-start gap-3.5 mb-2.5">
          {/* Real Fetched App Icon */}
          <AppIconImage pkg={pkg} size="md" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-sm text-neutral-100 truncate group-hover:text-sky-300 transition-colors">
                {pkg.name}
              </h3>
              {pkg.verified && (
                <span title="Verified WinGet Publisher">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5">
              {pkg.publisher}
            </p>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed mb-2.5">
          {pkg.description}
        </p>

        {/* Storage Size & Disk Requirement Indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono tabular-nums mb-3">
          <HardDrive className="w-3 h-3 text-neutral-500 shrink-0" />
          <span className="text-neutral-300" title="Installer download size">
            {pkg.formattedDownloadSize || pkg.formattedSize || '45 MB'} dl
          </span>
          <span className="text-neutral-600">·</span>
          <span className="text-neutral-400" title="Disk space required once installed">
            {pkg.formattedInstalledSize || '~150 MB'} disk req.
          </span>
        </div>
      </div>

      {/* Bottom Area: Unboxed Metadata + Action Button */}
      <div className="pt-2.5 border-t border-neutral-800/60 flex items-center justify-between gap-2 mt-auto">
        {/* Clean unboxed metadata with dot separators */}
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400 font-mono tabular-nums truncate">
          <span className="truncate">{pkg.category}</span>
          <span className="text-neutral-600">·</span>
          <span>v{pkg.latestVersion}</span>
        </div>

        {/* Primary Interactive Action Button */}
        <div>
          {hasUpdate ? (
            <button
              onClick={handleAction}
              disabled={isActionActive}
              title={`Update to ${pkg.latestVersion}`}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <ArrowUpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Update</span>
            </button>
          ) : pkg.isInstalled ? (
            <button
              onClick={handleAction}
              disabled={isActionActive}
              title="Installed (Click to uninstall)"
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-red-500/10 hover:text-red-300 hover:border-red-500/30 border border-emerald-500/20 rounded-md transition-colors whitespace-nowrap shrink-0 group/inst"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400 group-hover/inst:hidden" />
              <span className="group-hover/inst:hidden">Installed</span>
              <span className="hidden group-hover/inst:inline text-red-400">Uninstall</span>
            </button>
          ) : (
            <button
              onClick={handleAction}
              disabled={isActionActive}
              title="Install via WinGet"
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-100 bg-neutral-800 hover:bg-neutral-700 hover:text-white border border-neutral-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3 h-3 text-sky-400" />
              <span>Get</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
