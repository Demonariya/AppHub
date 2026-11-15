import React from 'react';
import { Package, TaskAction } from '../../types';
import {
  Check,
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

interface AppCardProps {
  pkg: Package;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  isActionActive?: boolean;
}

export const AppCard: React.FC<AppCardProps> = ({
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

  const handlePrimaryAction = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pkg.isExternal) return;
    if (hasUpdate) {
      onActionClick(pkg, 'update');
    } else if (pkg.isInstalled) {
      onActionClick(pkg, 'uninstall');
    } else {
      onActionClick(pkg, 'install');
    }
  };

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
    <article
      onClick={() => onOpenDetails(pkg)}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenDetails(pkg);
        }
      }}
      className="group h-full bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)]/65 border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[12px] p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between shadow-[var(--shadow-card)]"
    >
      <div>
        {/* Top Row: Icon + Name + Publisher + Favorite + Overflow */}
        <div className="flex items-start gap-3 mb-2.5">
          <AppIconImage pkg={pkg} size="md" />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="font-semibold text-[13px] text-[var(--text-primary)] truncate group-hover:text-[var(--accent-primary)] transition-colors">
                {pkg.name}
              </h3>
              {pkg.verified && !pkg.isExternal && (
                <span title="Verified WinGet Publisher">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
              {pkg.publisher || (pkg.isExternal ? 'Local Windows App' : `Source: ${pkg.source}`)}
            </p>
          </div>

          <div className="flex items-center gap-0.5 shrink-0" onClick={e => e.stopPropagation()}>
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(pkg)}
                aria-label={pkg.isFavorite ? `Remove ${pkg.name} from Favorites` : `Add ${pkg.name} to Favorites`}
                title={pkg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                className={`w-7 h-7 inline-flex items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
                  pkg.isFavorite
                    ? 'text-[var(--status-warning-fg)] hover:bg-[var(--surface-hover)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${pkg.isFavorite ? 'fill-current' : ''}`} />
              </button>
            )}
            <ContextMenu items={menuItems} ariaLabel={`Actions for ${pkg.name}`} />
          </div>
        </div>

        {/* Summary Description */}
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed mb-3 min-h-[2.4rem]">
          {pkg.description || pkg.id}
        </p>
      </div>

      {/* Bottom Metadata + Action Row */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums text-[var(--text-muted)] truncate">
          <span className="truncate">{pkg.isExternal ? 'External' : pkg.category}</span>
          <span>·</span>
          <span className="shrink-0">v{pkg.installedVersion || pkg.latestVersion}</span>
          {(pkg.isInstalled
            ? pkg.formattedInstalledSize || pkg.formattedDownloadSize || pkg.formattedSize
            : pkg.formattedDownloadSize || pkg.formattedSize) && (
            <>
              <span>·</span>
              <span
                className="shrink-0 text-[var(--text-secondary)]"
                title={
                  pkg.isInstalled && pkg.formattedInstalledSize
                    ? 'Installed disk footprint'
                    : 'Installer download size'
                }
              >
                {pkg.isInstalled
                  ? pkg.formattedInstalledSize || pkg.formattedDownloadSize || pkg.formattedSize
                  : pkg.formattedDownloadSize || pkg.formattedSize}
              </span>
            </>
          )}
        </div>

        <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-[var(--text-muted)] truncate">{pkg.id}</span>

          <div onClick={e => e.stopPropagation()} className="shrink-0">
            {pkg.isExternal ? (
              <span
                title="Detected locally outside WinGet repository"
                className="inline-flex items-center h-7 px-2.5 text-[11px] font-mono text-[var(--text-muted)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded-[6px] whitespace-nowrap"
              >
                External
              </span>
            ) : hasUpdate ? (
              <Button
                size="sm"
                variant="warning"
                onClick={handlePrimaryAction}
                disabled={isActionActive}
                leftIcon={<ArrowUpCircle className="w-3.5 h-3.5" />}
                title={`Update to v${pkg.latestVersion}`}
              >
                Update
              </Button>
            ) : pkg.isInstalled ? (
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={isActionActive}
                title="Installed (Click to uninstall)"
                className="group/inst inline-flex items-center gap-1.5 h-7 px-2.5 text-xs font-medium text-[var(--status-success-fg)] bg-[var(--status-success-bg)] hover:bg-[var(--status-danger-bg)] hover:text-[var(--status-danger-fg)] border border-[var(--status-success-border)] hover:border-[var(--status-danger-border)] rounded-[6px] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
              >
                <Check className="w-3.5 h-3.5 group-hover/inst:hidden" />
                <span className="group-hover/inst:hidden">Installed</span>
                <span className="hidden group-hover/inst:inline">Uninstall</span>
              </button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={handlePrimaryAction}
                disabled={isActionActive}
                leftIcon={<Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                title="Install via WinGet"
              >
                Get
              </Button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};
