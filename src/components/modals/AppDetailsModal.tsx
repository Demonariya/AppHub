import React, { useState, useEffect } from 'react';
import { Package, TaskAction, PackageVersionInfo } from '../../types';
import {
  X,
  Download,
  ArrowUpCircle,
  Trash2,
  RotateCw,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Terminal,
  History,
  RotateCcw,
  Folder,
  FolderOpen,
  Star,
  Loader2,
  SlidersHorizontal,
} from 'lucide-react';
import { wingetEngine } from '../../services/wingetEngine';
import { storage } from '../../services/storage';
import { isTauriEnvironment } from '../../services/tauriBridge';
import { AppIconImage } from '../common/AppIconImage';
import { getIconDiagnostics } from '../../services/icons';
import {
  Button,
  StatusBadge,
  SegmentedTabs,
  CollapsibleSection,
  ConfirmationDialog,
  useToast,
} from '../ui';

interface AppDetailsModalProps {
  pkg: Package | null;
  onClose: () => void;
  onActionClick: (pkg: Package, action: TaskAction, options?: any) => void;
  onToggleFavorite?: (pkg: Package) => void;
  isActionActive?: boolean;
}

export const AppDetailsModal: React.FC<AppDetailsModalProps> = ({
  pkg,
  onClose,
  onActionClick,
  onToggleFavorite,
  isActionActive = false,
}) => {
  const { showToast } = useToast();
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [silentMode, setSilentMode] = useState(() => storage.getSettings().silentInstall);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline'>('overview');
  const [enableCustomLocation, setEnableCustomLocation] = useState(false);
  const [customLocationPath, setCustomLocationPath] = useState('');

  const [liveMetadata, setLiveMetadata] = useState<Partial<Package> | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [versions, setVersions] = useState<PackageVersionInfo[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<PackageVersionInfo | null>(null);
  const [backupBeforeRollback, setBackupBeforeRollback] = useState(true);

  useEffect(() => {
    if (!pkg) {
      setVersions([]);
      setRollbackTarget(null);
      setLiveMetadata(null);
      return;
    }

    let cancelled = false;
    setActiveTab('overview');
    const settings = storage.getSettings();
    setSilentMode(settings.silentInstall);

    if (settings.useCustomLocationByDefault && settings.defaultCustomLocation) {
      setEnableCustomLocation(true);
      setCustomLocationPath(`${settings.defaultCustomLocation}\\${pkg.name}`);
    } else {
      setEnableCustomLocation(false);
      setCustomLocationPath(`D:\\Software\\${pkg.name}`);
    }

    setLiveMetadata(null);
    if (isTauriEnvironment() && !pkg.isExternal && wingetEngine.isValidPackageId(pkg.id)) {
      setLoadingDetails(true);
      wingetEngine
        .showPackageDetails(pkg.id)
        .then(details => {
          if (!cancelled && details) {
            setLiveMetadata(details);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoadingDetails(false);
        });
    }

    setLoadingVersions(true);
    wingetEngine
      .fetchPackageVersions(pkg)
      .then(res => {
        if (!cancelled) {
          setVersions(res);
          setLoadingVersions(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingVersions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pkg?.id, pkg?.installedVersion]);

  if (!pkg) return null;

  const displayPkg: Package = liveMetadata
    ? {
        ...pkg,
        ...liveMetadata,
        homepage: liveMetadata.homepage || pkg.homepage,
        publisherUrl: liveMetadata.publisherUrl || pkg.publisherUrl,
        license: liveMetadata.license || pkg.license,
        releaseDate: liveMetadata.releaseDate || pkg.releaseDate,
        description: liveMetadata.description || pkg.description,
        longDescription: liveMetadata.longDescription || pkg.longDescription,
        tags: liveMetadata.tags || pkg.tags,
      }
    : pkg;

  const effectiveCustomLocation =
    enableCustomLocation && customLocationPath.trim() ? customLocationPath.trim() : undefined;
  const iconDiag = getIconDiagnostics(displayPkg.id);
  const hasUpdate = Boolean(
    displayPkg.isInstalled &&
      displayPkg.installedVersion &&
      displayPkg.installedVersion !== displayPkg.latestVersion
  );

  const installCli = wingetEngine.formatCliPreview(
    wingetEngine.buildInstallArgs(displayPkg.id, {
      silent: silentMode,
      customLocation: effectiveCustomLocation,
    })
  );

  const handleCopyId = () => {
    navigator.clipboard?.writeText(displayPkg.id);
    setCopiedId(true);
    showToast({ title: 'Package ID Copied', description: displayPkg.id, tone: 'info' });
    setTimeout(() => setCopiedId(false), 1800);
  };

  const handleCopyCli = () => {
    navigator.clipboard?.writeText(installCli);
    setCopiedCli(true);
    showToast({ title: 'WinGet Command Copied', tone: 'info' });
    setTimeout(() => setCopiedCli(false), 1800);
  };

  const handleConfirmRollback = () => {
    if (!rollbackTarget) return;
    if (backupBeforeRollback) {
      const backupJson = storage.createFullBackup();
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `apphub_pre_rollback_${displayPkg.id}_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
    onActionClick(displayPkg, 'install', {
      targetVersion: rollbackTarget.version,
      force: true,
      silent: silentMode,
      customLocation: effectiveCustomLocation,
    });
    setRollbackTarget(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${displayPkg.name} details`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-[var(--surface-backdrop)] backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-4xl bg-[var(--surface-panel)] border border-[var(--border-strong)] rounded-[16px] shadow-[var(--shadow-dialog)] overflow-hidden flex flex-col max-h-[90vh] animate-page-in"
      >
        {/* Top Context Strip */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-subtle)] bg-[var(--surface-shell)]">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0">
            <span className="font-medium text-[var(--text-primary)] truncate">
              Application Details
            </span>
            <span className="text-[var(--text-muted)]">/</span>
            <span className="font-mono text-[11px] text-[var(--text-muted)] truncate">
              {displayPkg.id}
            </span>
            {loadingDetails && (
              <Loader2 className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-spin shrink-0" />
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(displayPkg)}
                aria-label={displayPkg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                title={displayPkg.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                className={`w-8 h-8 inline-flex items-center justify-center rounded-[6px] transition-colors cursor-pointer ${
                  displayPkg.isFavorite
                    ? 'text-[var(--status-warning-fg)] bg-[var(--status-warning-bg)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Star className={`w-4 h-4 ${displayPkg.isFavorite ? 'fill-current' : ''}`} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close application details"
              className="w-8 h-8 inline-flex items-center justify-center rounded-[6px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
          {/* Hero Summary */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 pb-5 border-b border-[var(--border-subtle)]">
            <div className="flex items-start gap-4 min-w-0">
              <AppIconImage pkg={displayPkg} size="lg" />

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
                    {displayPkg.name}
                  </h2>
                  {displayPkg.isExternal ? (
                    <StatusBadge status="external" compact />
                  ) : displayPkg.verified ? (
                    <StatusBadge status="verified" compact />
                  ) : (
                    <StatusBadge status="community" compact />
                  )}
                  {hasUpdate ? (
                    <StatusBadge status="update" label={`Update v${displayPkg.latestVersion}`} compact />
                  ) : displayPkg.isInstalled ? (
                    <StatusBadge
                      status="installed"
                      label={`Installed v${displayPkg.installedVersion}`}
                      compact
                    />
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-[var(--text-primary)]">
                    {displayPkg.publisher}
                  </span>
                  <span className="text-[var(--text-muted)]">·</span>
                  <button
                    type="button"
                    onClick={handleCopyId}
                    title="Copy Package ID"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                  >
                    <span>{displayPkg.id}</span>
                    {copiedId ? (
                      <Check className="w-3 h-3 text-[var(--status-success-fg)]" />
                    ) : (
                      <Copy className="w-3 h-3 opacity-70" />
                    )}
                  </button>
                  <span className="text-[var(--text-muted)]">·</span>
                  <span>{displayPkg.category}</span>
                </div>
              </div>
            </div>

            {/* Primary Actions */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
              {displayPkg.isExternal ? (
                <div className="px-3 py-2 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs font-mono text-[var(--text-secondary)]">
                  Managed outside WinGet
                </div>
              ) : hasUpdate ? (
                <Button
                  size="lg"
                  variant="warning"
                  disabled={isActionActive}
                  leftIcon={<ArrowUpCircle className="w-4 h-4" />}
                  onClick={() => onActionClick(displayPkg, 'update', { silent: silentMode })}
                >
                  Update to v{displayPkg.latestVersion}
                </Button>
              ) : displayPkg.isInstalled ? (
                <>
                  <Button
                    size="md"
                    variant="secondary"
                    disabled={isActionActive}
                    leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                    onClick={() =>
                      onActionClick(displayPkg, 'reinstall', {
                        silent: silentMode,
                        customLocation: effectiveCustomLocation,
                      })
                    }
                  >
                    Reinstall
                  </Button>
                  <Button
                    size="md"
                    variant="danger"
                    disabled={isActionActive}
                    leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                    onClick={() => onActionClick(displayPkg, 'uninstall', { silent: silentMode })}
                  >
                    Uninstall
                  </Button>
                </>
              ) : (
                <Button
                  size="lg"
                  variant="primary"
                  disabled={isActionActive}
                  leftIcon={<Download className="w-4 h-4" />}
                  onClick={() =>
                    onActionClick(displayPkg, 'install', {
                      silent: silentMode,
                      customLocation: effectiveCustomLocation,
                    })
                  }
                >
                  Install Package
                </Button>
              )}
            </div>
          </div>

          {/* Sub-navigation Tabs */}
          <SegmentedTabs
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Application detail sections"
            options={[
              { id: 'overview', label: 'Overview & Specifications' },
              {
                id: 'timeline',
                label: 'Version History & Rollback',
                count: versions.length || undefined,
              },
            ]}
          />

          {/* TAB 1: OVERVIEW & SPECIFICATIONS */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Columns: Description + Links + Progressive Disclosure */}
              <div className="lg:col-span-2 space-y-5">
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Overview
                  </h3>
                  <p className="text-[13px] text-[var(--text-primary)] leading-relaxed">
                    {displayPkg.longDescription ||
                      displayPkg.description ||
                      'No description provided in manifest.'}
                  </p>
                </section>

                {displayPkg.releaseNotes && (
                  <section className="space-y-2 p-4 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      Release Notes
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                      {displayPkg.releaseNotes}
                    </p>
                  </section>
                )}

                {/* Official Links */}
                {(displayPkg.homepage || displayPkg.publisherUrl || displayPkg.licenseUrl) && (
                  <div className="flex flex-wrap items-center gap-4 pt-2 text-xs">
                    {displayPkg.homepage && (
                      <a
                        href={displayPkg.homepage}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-[var(--accent-primary)] hover:underline"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Official Website</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {displayPkg.publisherUrl && (
                      <a
                        href={displayPkg.publisherUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                      >
                        <span>Publisher Portal</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {displayPkg.licenseUrl && (
                      <a
                        href={displayPkg.licenseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
                      >
                        <span>License Terms</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {/* Progressive Disclosure: Advanced CLI & Custom Install Path */}
                {!displayPkg.isExternal && (
                  <CollapsibleSection
                    title="Advanced Installation Options & CLI Command"
                    subtitle="Configure custom --location directory or inspect exact WinGet arguments"
                    icon={<SlidersHorizontal className="w-4 h-4" />}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                          <Terminal className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                          <span>WinGet Execution Command</span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={handleCopyCli}>
                          {copiedCli ? 'Copied' : 'Copy Command'}
                        </Button>
                      </div>
                      <div className="font-mono text-xs text-[var(--text-primary)] bg-[var(--surface-input)] p-3 rounded-[8px] border border-[var(--border-subtle)] break-all select-all">
                        {installCli}
                      </div>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-[var(--border-subtle)]">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-[var(--text-primary)]">
                          <Folder className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>Custom Install Directory</span>
                        </div>

                        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={enableCustomLocation}
                            onChange={e => setEnableCustomLocation(e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-[var(--accent-primary)] cursor-pointer"
                          />
                          <span className="font-mono text-[11px]">
                            Use <code className="text-[var(--accent-primary)]">--location</code>
                          </span>
                        </label>
                      </div>

                      {enableCustomLocation ? (
                        <div className="space-y-2">
                          <div className="relative">
                            <FolderOpen className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              value={customLocationPath}
                              onChange={e => setCustomLocationPath(e.target.value)}
                              aria-label="Custom install directory path"
                              placeholder="e.g. D:\Software\Application"
                              className="w-full pl-9 pr-3 h-8 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-[var(--text-muted)] font-mono">Presets:</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCustomLocationPath(`C:\\Program Files\\${displayPkg.name}`)
                              }
                              className="px-2 py-0.5 rounded-[5px] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono cursor-pointer"
                            >
                              C:\Program Files\{displayPkg.name}
                            </button>
                            <button
                              type="button"
                              onClick={() => setCustomLocationPath(`D:\\Software\\${displayPkg.name}`)}
                              className="px-2 py-0.5 rounded-[5px] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-mono cursor-pointer"
                            >
                              D:\Software\{displayPkg.name}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-[var(--text-muted)]">
                          Uses the default WinGet installer target directory.
                        </p>
                      )}
                    </div>
                  </CollapsibleSection>
                )}
              </div>

              {/* Right Column: Structured Metadata Table */}
              <aside className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-4 space-y-3 h-fit">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Package Specifications
                </h3>

                <dl className="divide-y divide-[var(--border-subtle)] text-xs">
                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Latest Version</dt>
                    <dd className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      v{displayPkg.latestVersion}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Installed Version</dt>
                    <dd className="font-mono text-[var(--text-primary)] tabular-nums">
                      {displayPkg.isInstalled ? `v${displayPkg.installedVersion}` : 'Not installed'}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Source</dt>
                    <dd className="font-mono text-[var(--text-primary)]">{displayPkg.source}</dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Architectures</dt>
                    <dd className="font-mono uppercase text-[var(--text-primary)]">
                      {displayPkg.architectures.join(', ')}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Installer Type</dt>
                    <dd className="font-mono uppercase text-[var(--text-primary)]">
                      {displayPkg.installerType || 'Unspecified'}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">License</dt>
                    <dd className="font-mono text-[var(--text-primary)] text-right truncate max-w-[160px]">
                      {displayPkg.license || 'Unspecified'}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Release Date</dt>
                    <dd className="font-mono text-[var(--text-primary)] tabular-nums">
                      {displayPkg.releaseDate || 'Not reported'}
                    </dd>
                  </div>

                  <div className="py-2 flex items-center justify-between gap-3">
                    <dt className="text-[var(--text-secondary)]">Icon Provenance</dt>
                    <dd
                      className="font-mono text-[var(--text-secondary)] truncate max-w-[150px]"
                      title={iconDiag.notes || iconDiag.primaryUrl}
                    >
                      {iconDiag.sourceType === 'official-asset'
                        ? 'Official SVG'
                        : iconDiag.sourceType === 'official-cdn'
                        ? 'Official CDN'
                        : iconDiag.sourceType === 'curated-registry'
                        ? 'Curated Asset'
                        : 'Monogram'}
                    </dd>
                  </div>
                </dl>

                {displayPkg.sha256 && (
                  <div className="pt-2 border-t border-[var(--border-subtle)]">
                    <div className="text-[11px] font-medium text-[var(--text-muted)] mb-1">
                      SHA256 Digest
                    </div>
                    <div className="text-[10px] font-mono text-[var(--text-secondary)] break-all bg-[var(--surface-input)] p-2 rounded-[6px] border border-[var(--border-subtle)]">
                      {displayPkg.sha256}
                    </div>
                  </div>
                )}
              </aside>
            </div>
          )}

          {/* TAB 2: VERSION TIMELINE & ROLLBACK */}
          {activeTab === 'timeline' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <History className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span>Release History</span>
                  <span className="text-xs font-mono text-[var(--text-muted)]">
                    (winget show --id {displayPkg.id} --versions)
                  </span>
                </h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  Versions indexed in Microsoft WinGet. Install a specific release or roll back safely.
                </p>
              </div>

              {loadingVersions ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)] space-y-2">
                  <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin mx-auto" />
                  <p>Querying WinGet manifest index...</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-[2px] before:bg-[var(--border-subtle)]">
                  {versions.map(ver => {
                    const isInstalledVersion = displayPkg.installedVersion === ver.version;
                    const isLatestVersion = displayPkg.latestVersion === ver.version;
                    const isOlderThanInstalled = Boolean(
                      displayPkg.isInstalled &&
                        displayPkg.installedVersion &&
                        ver.version.localeCompare(displayPkg.installedVersion, undefined, {
                          numeric: true,
                        }) < 0
                    );

                    return (
                      <div key={ver.version} className="relative">
                        <div
                          className={`absolute -left-6 top-3 w-3 h-3 rounded-full border-2 border-[var(--surface-panel)] ${
                            isInstalledVersion
                              ? 'bg-[var(--status-success-fg)]'
                              : isLatestVersion
                              ? 'bg-[var(--accent-primary)]'
                              : 'bg-[var(--text-muted)]'
                          }`}
                        />

                        <div
                          className={`p-4 rounded-[12px] border transition-colors ${
                            isInstalledVersion
                              ? 'bg-[var(--status-success-bg)] border-[var(--status-success-border)]'
                              : 'bg-[var(--surface-subtle)] border-[var(--border-subtle)]'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-sm font-bold text-[var(--text-primary)] tabular-nums">
                                  v{ver.version}
                                </span>
                                {isInstalledVersion && (
                                  <StatusBadge status="installed" label="Active Version" compact />
                                )}
                                {isLatestVersion && (
                                  <StatusBadge status="verified" label="Latest Release" compact />
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-mono mt-1">
                                <span>{ver.releaseDate}</span>
                                {ver.downloadSize && (
                                  <>
                                    <span>·</span>
                                    <span>{ver.downloadSize}</span>
                                  </>
                                )}
                              </div>
                            </div>

                            {!displayPkg.isExternal && !isInstalledVersion && (
                              <div className="shrink-0">
                                {isOlderThanInstalled ? (
                                  <Button
                                    size="sm"
                                    variant="warning"
                                    leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                                    onClick={() => setRollbackTarget(ver)}
                                  >
                                    Roll Back to v{ver.version}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    leftIcon={<Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                                    onClick={() =>
                                      onActionClick(displayPkg, 'install', {
                                        targetVersion: ver.version,
                                        silent: silentMode,
                                      })
                                    }
                                  >
                                    Install v{ver.version}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>

                          <p className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] leading-relaxed">
                            {ver.changelog}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Dialog for Version Rollback */}
      <ConfirmationDialog
        isOpen={Boolean(rollbackTarget)}
        onCancel={() => setRollbackTarget(null)}
        onConfirm={handleConfirmRollback}
        title={`Roll Back ${displayPkg.name}`}
        description={
          rollbackTarget
            ? `Downgrade from v${displayPkg.installedVersion} to v${rollbackTarget.version} via WinGet.`
            : ''
        }
        confirmLabel={rollbackTarget ? `Roll Back to v${rollbackTarget.version}` : 'Confirm Rollback'}
        tone="warning"
      >
        {rollbackTarget && (
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span className="text-[var(--text-secondary)]">Current:</span>
                <span className="text-[var(--text-primary)]">v{displayPkg.installedVersion}</span>
              </div>
              <div className="flex justify-between text-[var(--status-warning-fg)] font-semibold">
                <span>Rollback Target:</span>
                <span>v{rollbackTarget.version}</span>
              </div>
            </div>
            <p className="text-[var(--text-secondary)] leading-relaxed">
              Executes <code className="font-mono text-[var(--text-primary)]">--version {rollbackTarget.version} --force</code> via WinGet.
            </p>
            <label className="flex items-center gap-2 text-[var(--text-primary)] cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={backupBeforeRollback}
                onChange={e => setBackupBeforeRollback(e.target.checked)}
                className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
              />
              <span>Download AppHub backup snapshot before rollback</span>
            </label>
          </div>
        )}
      </ConfirmationDialog>
    </div>
  );
};
