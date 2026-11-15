import React from 'react';
import { Package, TaskAction } from '../../types';
import {
  ArrowUpCircle,
  Download,
  ShieldCheck,
  Star,
  Copy,
  ExternalLink,
  RotateCw,
  Trash2,
  Info,
} from 'lucide-react';
import { AppIconImage } from './AppIconImage';
import { Button, ContextMenu, ContextMenuItem, useToast } from '../ui';

interface AppListItemProps {
  pkg: Package;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  isActionActive?: boolean;
}

export const AppListItem: React.FC<AppListItemProps> = ({
  pkg,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  isActionActive = false,
}) => {
  const { showToast } = useToast();
  const hasUpdate = Boolean(
    pkg.isInstalled && pkg.installedVersion && pkg.installedVersion !== pkg.latestVersion
  );

  const menuItems: ContextMenuItem[] = [
    {
      id: 'details',
      label: 'View Details',
      icon: <Info className="w-3.5 h-3.5" />,
      onClick: () => onOpenDetails(pkg),
    },
    {
      id: 'copy-id',
      label: 'Copy Package ID',
      icon: <Copy className="w-3.5 h-3.5" />,
      onClick: () => {
        navigator.clipboard?.writeText(pkg.id);
        showToast({ title: 'Copied Package ID', description: pkg.id, tone: 'info' });
      },
    },
    ...(pkg.homepage
      ? [
          {
            id: 'homepage',
            label: 'Official Website',
            icon: <ExternalLink className="w-3.5 h-3.5" />,
            onClick: () => window.open(pkg.homepage, '_blank', 'noopener,noreferrer'),
          },
        ]
      : []),
    ...(!pkg.isExternal && pkg.isInstalled
      ? [
          {
            id: 'reinstall',
            label: 'Reinstall',
            icon: <RotateCw className="w-3.5 h-3.5" />,
            onClick: () => onActionClick(pkg, 'reinstall'),
            dividerBefore: true,
          },
          {
            id: 'uninstall',
            label: 'Uninstall',
            icon: <Trash2 className="w-3.5 h-3.5" />,
            onClick: () => onActionClick(pkg, 'uninstall'),
            tone: 'danger' as const,
          },
        ]
      : []),
  ];

  return (
    <div
      onClick={() => onOpenDetails(pkg)}
      className="group flex items-center justify-between gap-4 px-4 py-3 bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)]/70 transition-colors cursor-pointer"
    >
      {/* Left: Icon + Title + Package ID */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <AppIconImage pkg={pkg} size="sm" />

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-xs text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
              {pkg.name}
            </span>
            {pkg.verified && !pkg.isExternal && (
              <span title="Verified Publisher">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
              </span>
            )}
            {pkg.isExternal && (
              <span className="text-[10px] font-mono text-[var(--text-muted)]">· External</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] font-mono truncate">
            <span className="truncate">{pkg.id}</span>
            {pkg.publisher && (
              <>
                <span>·</span>
                <span className="text-[var(--text-secondary)] truncate">{pkg.publisher}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Middle: Source, Size & Versions */}
      <div className="hidden md:flex items-center gap-6 text-xs text-[var(--text-secondary)] font-mono tabular-nums shrink-0">
        <div className="w-24 truncate">{pkg.isExternal ? 'Local' : pkg.source}</div>

        <div
          className="w-20 text-right truncate"
          title={
            pkg.isInstalled && pkg.formattedInstalledSize
              ? 'Installed disk footprint'
              : 'Installer download size'
          }
        >
          {pkg.isInstalled
            ? pkg.formattedInstalledSize || pkg.formattedDownloadSize || pkg.formattedSize || (
                <span className="text-[var(--text-muted)]">—</span>
              )
            : pkg.formattedDownloadSize || pkg.formattedSize || (
                <span className="text-[var(--text-muted)]">—</span>
              )}
        </div>

        <div className="w-24 text-right truncate">
          {pkg.isInstalled ? (
            <span>v{pkg.installedVersion}</span>
          ) : (
            <span className="text-[var(--text-muted)]">—</span>
          )}
        </div>

        <div className="w-24 text-right text-[var(--text-primary)] truncate">
          <span>v{pkg.latestVersion}</span>
        </div>
      </div>

      {/* Right: Favorite + Primary Action + Context Menu */}
      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(pkg)}
            aria-label={pkg.isFavorite ? `Remove ${pkg.name} from Favorites` : `Add ${pkg.name} to Favorites`}
            title={pkg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            className={`w-7 h-7 inline-flex items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
              pkg.isFavorite
                ? 'text-[var(--status-warning-fg)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${pkg.isFavorite ? 'fill-current' : ''}`} />
          </button>
        )}

        {pkg.isExternal ? (
          <span
            title="Installed outside WinGet repository; manage via Windows Installed Apps"
            className="inline-flex items-center h-7 px-2.5 text-[11px] font-mono text-[var(--text-muted)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded-[6px] whitespace-nowrap"
          >
            Non-WinGet
          </span>
        ) : hasUpdate ? (
          <Button
            size="sm"
            variant="warning"
            onClick={() => onActionClick(pkg, 'update')}
            disabled={isActionActive}
            leftIcon={<ArrowUpCircle className="w-3.5 h-3.5" />}
          >
            Update
          </Button>
        ) : pkg.isInstalled ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => onActionClick(pkg, 'uninstall')}
            disabled={isActionActive}
          >
            Uninstall
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onActionClick(pkg, 'install')}
            disabled={isActionActive}
            leftIcon={<Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
          >
            Get
          </Button>
        )}

        <ContextMenu items={menuItems} ariaLabel={`More options for ${pkg.name}`} />
      </div>
    </div>
  );
};
