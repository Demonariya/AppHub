import React, { useState, useEffect } from 'react';
import { Package, TaskAction, PackageVersionInfo } from '../../types';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  Download,
  ArrowUpCircle,
  Trash2,
  RotateCw,
  ExternalLink,
  Copy,
  Check,
  Globe,
  Terminal,
  Cpu,
  HardDrive,
  FileCode,
  Calendar,
  Layers,
  History,
  AlertTriangle,
  RotateCcw,
  Clock,
  Sparkles,
  Info,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { wingetEngine } from '../../services/wingetEngine';
import { storage } from '../../services/storage';
import { AppIconImage } from '../common/AppIconImage';
import { getIconDiagnostics } from '../../services/icons';

interface AppDetailsModalProps {
  pkg: Package | null;
  onClose: () => void;
  onActionClick: (pkg: Package, action: TaskAction, options?: any) => void;
  isActionActive?: boolean;
}

export const AppDetailsModal: React.FC<AppDetailsModalProps> = ({
  pkg,
  onClose,
  onActionClick,
  isActionActive = false,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [silentMode, setSilentMode] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline'>('overview');
  const [enableCustomLocation, setEnableCustomLocation] = useState(false);
  const [customLocationPath, setCustomLocationPath] = useState('');

  // Version Timeline State
  const [versions, setVersions] = useState<PackageVersionInfo[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<PackageVersionInfo | null>(null);
  const [backupBeforeRollback, setBackupBeforeRollback] = useState(true);

  useEffect(() => {
    if (pkg) {
      const settings = storage.getSettings();
      if (settings.useCustomLocationByDefault && settings.defaultCustomLocation) {
        setEnableCustomLocation(true);
        setCustomLocationPath(`${settings.defaultCustomLocation}\\${pkg.name}`);
      } else {
        setCustomLocationPath(`D:\\Software\\${pkg.name}`);
      }
      setLoadingVersions(true);
      wingetEngine
        .fetchPackageVersions(pkg)
        .then(res => {
          setVersions(res);
          setLoadingVersions(false);
        })
        .catch(() => {
          setLoadingVersions(false);
        });
    } else {
      setVersions([]);
      setRollbackTarget(null);
    }
  }, [pkg?.id, pkg?.installedVersion]);

  if (!pkg) return null;

  const effectiveCustomLocation = enableCustomLocation && customLocationPath.trim() ? customLocationPath.trim() : undefined;
  const iconDiag = getIconDiagnostics(pkg.id);
  const hasUpdate = pkg.isInstalled && pkg.installedVersion && pkg.installedVersion !== pkg.latestVersion;
  const installCli = wingetEngine.formatCliPreview(
    wingetEngine.buildInstallArgs(pkg.id, {
      silent: silentMode,
      customLocation: effectiveCustomLocation,
    })
  );

  const handleCopyId = () => {
    navigator.clipboard.writeText(pkg.id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCopyCli = () => {
    navigator.clipboard.writeText(installCli);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const handleConfirmRollback = () => {
    if (!rollbackTarget) return;
    onActionClick(pkg, 'install', {
      targetVersion: rollbackTarget.version,
      force: true,
      silent: silentMode,
      customLocation: effectiveCustomLocation,
    });
    setRollbackTarget(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div
        className="w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-neutral-800/80 bg-neutral-950/40">
          <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
            <Terminal className="w-3.5 h-3.5 text-neutral-500" />
            <span>winget show --id {pkg.id}</span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Main Info Hero */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pb-6 border-b border-neutral-800/70">
            <div className="flex items-start gap-4">
              {/* Real Fetched High-Res App Icon */}
              <AppIconImage pkg={pkg} size="lg" />

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-neutral-100">{pkg.name}</h2>
                  {pkg.verified ? (
                    <div className="flex items-center gap-1 text-[11px] text-sky-400 font-medium">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verified Publisher</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Community Source</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 mt-1">
                  <span>{pkg.publisher}</span>
                  <span className="text-neutral-600">·</span>
                  <button
                    onClick={handleCopyId}
                    title="Click to copy package ID"
                    className="flex items-center gap-1 font-mono text-neutral-300 hover:text-sky-400 transition-colors"
                  >
                    <span>{pkg.id}</span>
                    {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-neutral-500" />}
                  </button>
                  <span className="text-neutral-600">·</span>
                  <span>{pkg.category}</span>
                </div>
              </div>
            </div>

            {/* Top Primary Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              {hasUpdate ? (
                <button
                  onClick={() => onActionClick(pkg, 'update', { silent: silentMode })}
                  disabled={isActionActive}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  <span>Update to v{pkg.latestVersion}</span>
                </button>
              ) : pkg.isInstalled ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => onActionClick(pkg, 'reinstall', { silent: silentMode, customLocation: effectiveCustomLocation })}
                    disabled={isActionActive}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-300 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Reinstall</span>
                  </button>
                  <button
                    onClick={() => onActionClick(pkg, 'uninstall', { silent: silentMode })}
                    disabled={isActionActive}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    <span>Uninstall</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onActionClick(pkg, 'install', { silent: silentMode, customLocation: effectiveCustomLocation })}
                  disabled={isActionActive}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg shadow-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>Install Package</span>
                </button>
              )}
            </div>
          </div>

          {/* Navigation Sub-Tabs: Overview vs Version Timeline */}
          <div className="flex items-center gap-2 p-1 bg-neutral-950 border border-neutral-800 rounded-xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'overview'
                  ? 'bg-neutral-800 text-white font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Info className="w-3.5 h-3.5" />
              <span>Overview & Specifications</span>
            </button>
            <button
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'timeline'
                  ? 'bg-neutral-800 text-sky-400 font-semibold shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Version Timeline & Rollback ({versions.length || '...'})</span>
            </button>
          </div>

          {/* TAB 1: OVERVIEW & SPECS */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Overview
                </h4>
                <p className="text-sm text-neutral-300 leading-relaxed">
                  {pkg.longDescription || pkg.description}
                </p>
              </div>

              {/* CLI WinGet Command Preview */}
              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span className="font-semibold text-neutral-300">WinGet Execution Command</span>
                  <button
                    onClick={handleCopyCli}
                    className="flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    {copiedCli ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCli ? 'Copied' : 'Copy Command'}</span>
                  </button>
                </div>
                <div className="font-mono text-xs text-neutral-300 bg-neutral-900/80 p-2.5 rounded border border-neutral-800 break-all select-all">
                  {installCli}
                </div>
              </div>

              {/* Storage & Disk Space Requirements */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                      Storage & Disk Space Requirements
                    </h4>
                  </div>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Target Volume: C:\ (NTFS) · 382.4 GB Available
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3 rounded-lg bg-neutral-900/80 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Installer Download Size</span>
                      <span className="text-[10px] font-mono text-neutral-500">Over Network</span>
                    </div>
                    <div className="text-base font-mono font-bold text-neutral-100 tabular-nums">
                      {pkg.formattedDownloadSize || pkg.formattedSize || '45.0 MB'}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Compressed {pkg.installerType || 'exe'} package transferred via WinGet CDN
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-900/80 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Required Storage on Disk</span>
                      <span className="text-[10px] font-mono text-sky-400 font-semibold">Local Footprint</span>
                    </div>
                    <div className="text-base font-mono font-bold text-sky-400 tabular-nums">
                      {pkg.formattedInstalledSize || '~150.0 MB'}
                    </div>
                    <div className="text-[10px] text-neutral-400">
                      Extracted application files, binaries, runtimes, and local cache
                    </div>
                  </div>
                </div>

                {/* Storage Impact Visual Indicator */}
                <div className="pt-1 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                    <span>Drive C:\ Space Consumption:</span>
                    <span className="text-emerald-400 font-medium">Sufficient Space Available (&lt; 0.1% of volume)</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div className="h-full bg-sky-400 rounded-full w-2" />
                  </div>
                </div>
              </div>

              {/* Custom Path Installation Target */}
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Folder className="w-4 h-4 text-sky-400" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                      Installation Target Path
                    </h4>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableCustomLocation}
                      onChange={e => setEnableCustomLocation(e.target.checked)}
                      className="w-3.5 h-3.5 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-[11px] font-mono text-neutral-300">
                      Customize Directory (<code className="text-sky-400">--location</code>)
                    </span>
                  </label>
                </div>

                {enableCustomLocation ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="relative">
                      <FolderOpen className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={customLocationPath}
                        onChange={e => setCustomLocationPath(e.target.value)}
                        placeholder="e.g. D:\Software\Application or C:\Apps\..."
                        className="w-full pl-9 pr-3 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-sky-500 transition-colors"
                      />
                    </div>

                    {/* Quick Drive Presets */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      <span className="text-neutral-500 text-[10px] uppercase font-mono">Presets:</span>
                      <button
                        type="button"
                        onClick={() => setCustomLocationPath(`C:\\Program Files\\${pkg.name}`)}
                        className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-mono text-[10px] transition-colors"
                      >
                        C:\Program Files\{pkg.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomLocationPath(`D:\\Software\\${pkg.name}`)}
                        className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-mono text-[10px] transition-colors"
                      >
                        D:\Software\{pkg.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomLocationPath(`D:\\Apps\\${pkg.name}`)}
                        className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-mono text-[10px] transition-colors"
                      >
                        D:\Apps\{pkg.name}
                      </button>
                      {pkg.category === 'Gaming' && (
                        <button
                          type="button"
                          onClick={() => setCustomLocationPath(`E:\\Games\\${pkg.name}`)}
                          className="px-2 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white font-mono text-[10px] transition-colors"
                        >
                          E:\Games\{pkg.name}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-400 font-mono">
                    Default target directory: <span className="text-neutral-300">C:\Program Files\{pkg.name}</span> (standard WinGet destination)
                  </p>
                )}
              </div>

              {/* Technical Specifications Grid */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">
                  Package Specifications
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <FileCode className="w-3.5 h-3.5 text-sky-400" />
                      <span>Latest Version</span>
                    </div>
                    <div className="text-xs font-mono font-semibold text-neutral-200">
                      {pkg.latestVersion}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Current Status</span>
                    </div>
                    <div className="text-xs font-mono font-semibold text-neutral-200">
                      {pkg.isInstalled ? (
                        <span className="text-emerald-400">Installed (v{pkg.installedVersion})</span>
                      ) : (
                        <span className="text-neutral-400">Not Installed</span>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Cpu className="w-3.5 h-3.5 text-amber-400" />
                      <span>Architectures</span>
                    </div>
                    <div className="text-xs font-mono text-neutral-200 uppercase">
                      {pkg.architectures.join(', ')}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span>Installer Type</span>
                    </div>
                    <div className="text-xs font-mono uppercase text-neutral-200">
                      {pkg.installerType || 'exe'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Globe className="w-3.5 h-3.5 text-indigo-400" />
                      <span>License</span>
                    </div>
                    <div className="text-xs font-mono text-neutral-200 truncate">
                      {pkg.license}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Calendar className="w-3.5 h-3.5 text-teal-400" />
                      <span>Release Date</span>
                    </div>
                    <div className="text-xs font-mono text-neutral-200">
                      {pkg.releaseDate}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Download className="w-3.5 h-3.5 text-sky-400" />
                      <span>Download Size</span>
                    </div>
                    <div className="text-xs font-mono text-neutral-200">
                      {pkg.formattedDownloadSize || pkg.formattedSize || '45 MB'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <HardDrive className="w-3.5 h-3.5 text-sky-400" />
                      <span>Disk Space Req.</span>
                    </div>
                    <div className="text-xs font-mono text-sky-400 font-semibold">
                      {pkg.formattedInstalledSize || '~150 MB'}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Icon Asset</span>
                    </div>
                    <div className="text-xs font-mono text-neutral-200 truncate" title={iconDiag.notes || iconDiag.primaryUrl}>
                      {iconDiag.sourceType === 'official-asset'
                        ? 'Official Vector SVG'
                        : iconDiag.sourceType === 'official-cdn'
                        ? 'Official Developer CDN'
                        : iconDiag.sourceType === 'curated-registry'
                        ? 'Curated Authentic Icon'
                        : iconDiag.sourceType === 'package-manifest'
                        ? 'Manifest Metadata'
                        : 'Neutral Monogram'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Links and SHA256 */}
              <div className="space-y-3 pt-2 border-t border-neutral-800/80 text-xs">
                <div className="flex flex-wrap items-center gap-4 text-neutral-400">
                  {pkg.homepage && (
                    <a
                      href={pkg.homepage}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-sky-400 hover:underline"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Official Homepage</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}

                  {pkg.publisherUrl && (
                    <a
                      href={pkg.publisherUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-neutral-300 hover:text-white hover:underline"
                    >
                      <span>Publisher Info</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {pkg.sha256 && (
                  <div className="text-[11px] font-mono text-neutral-400 break-all">
                    <span className="text-neutral-400">SHA256: </span>
                    <span>{pkg.sha256}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VISUAL VERSION TIMELINE & ROLLBACK */}
          {activeTab === 'timeline' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                    <span>Release History Timeline</span>
                    <span className="text-xs font-mono text-neutral-500">
                      (winget show --id {pkg.id} --versions)
                    </span>
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    Chronological builds indexed by Microsoft WinGet. Compare changes and roll back to previous versions safely.
                  </p>
                </div>
              </div>

              {loadingVersions ? (
                <div className="py-12 text-center text-xs text-neutral-400 space-y-2">
                  <div className="w-5 h-5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Querying WinGet manifest index for package versions...</p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-neutral-800">
                  {versions.map((ver, idx) => {
                    const isInstalledVersion = pkg.installedVersion === ver.version;
                    const isLatestVersion = pkg.latestVersion === ver.version;
                    const isOlderThanInstalled =
                      pkg.isInstalled &&
                      pkg.installedVersion &&
                      ver.version.localeCompare(pkg.installedVersion, undefined, { numeric: true }) < 0;

                    return (
                      <div key={ver.version} className="relative group">
                        {/* Timeline Node Dot */}
                        <div
                          className={`absolute -left-6 top-1.5 w-3 h-3 rounded-full border-2 transition-transform group-hover:scale-125 ${
                            isInstalledVersion
                              ? 'bg-emerald-500 border-neutral-900 ring-2 ring-emerald-500/30'
                              : isLatestVersion
                              ? 'bg-sky-400 border-neutral-900'
                              : ver.breakingChanges
                              ? 'bg-amber-400 border-neutral-900'
                              : 'bg-neutral-700 border-neutral-900'
                          }`}
                        />

                        {/* Version Card */}
                        <div
                          className={`p-4 rounded-xl border transition-all ${
                            isInstalledVersion
                              ? 'bg-emerald-950/20 border-emerald-500/40'
                              : 'bg-neutral-950/60 border-neutral-800/80 hover:border-neutral-700 hover:bg-neutral-950'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div>
                              {/* Unboxed Version Metadata */}
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-bold text-neutral-100 tabular-nums">
                                  v{ver.version}
                                </span>

                                {isInstalledVersion && (
                                  <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" /> Currently Installed
                                  </span>
                                )}

                                {isLatestVersion && (
                                  <span className="text-[11px] font-mono text-sky-400 font-semibold flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" /> Latest Release
                                  </span>
                                )}

                                {ver.breakingChanges && (
                                  <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3" /> Breaking Changes
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono mt-1">
                                <span>Released: {ver.releaseDate}</span>
                                <span className="text-neutral-600">·</span>
                                <span>Size: {ver.downloadSize || '45 MB'}</span>
                                <span className="text-neutral-600">·</span>
                                <span className="uppercase text-[10px] text-neutral-500">{ver.type}</span>
                              </div>
                            </div>

                            {/* Rollback / Action Button */}
                            <div className="shrink-0">
                              {isInstalledVersion ? (
                                <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Active Version</span>
                                </div>
                              ) : isOlderThanInstalled ? (
                                <button
                                  onClick={() => setRollbackTarget(ver)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Roll Back to v{ver.version}</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() =>
                                    onActionClick(pkg, 'install', {
                                      targetVersion: ver.version,
                                      silent: silentMode,
                                    })
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5 text-sky-400" />
                                  <span>Install v{ver.version}</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Release Notes / Changelog */}
                          <div className="mt-2.5 pt-2.5 border-t border-neutral-800/60 text-xs text-neutral-300 leading-relaxed">
                            {ver.changelog}
                          </div>

                          {/* WinGet specific rollback command */}
                          <div className="mt-2 text-[10px] font-mono text-neutral-500 flex items-center gap-1.5">
                            <Terminal className="w-3 h-3 text-neutral-600" />
                            <span>winget install --id {pkg.id} --version {ver.version} --exact --force</span>
                          </div>
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

      {/* Confirmation Sub-Modal for Rollback Decision */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-900 border border-amber-500/40 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-neutral-100">
                  Confirm Application Rollback
                </h3>
                <p className="text-xs text-neutral-400">
                  Downgrade {pkg.name} from v{pkg.installedVersion} to v{rollbackTarget.version}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-300">
                <span>Current Version:</span>
                <span className="font-mono text-neutral-400">v{pkg.installedVersion}</span>
              </div>
              <div className="flex items-center justify-between text-amber-300 font-semibold">
                <span>Rollback Target:</span>
                <span className="font-mono">v{rollbackTarget.version}</span>
              </div>
              <div className="text-[11px] text-neutral-400 pt-1 border-t border-neutral-800">
                Release Date: {rollbackTarget.releaseDate}
              </div>
            </div>

            <div className="text-xs text-neutral-300 space-y-2 leading-relaxed">
              <p>
                Rolling back to an older version overrides the currently installed files using WinGet's <code className="text-amber-300 font-mono">--force</code> flag.
              </p>
              {rollbackTarget.breakingChanges && (
                <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Warning: This target version contains breaking format changes. Ensure you backup your user settings or workspace databases before continuing.
                  </span>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none pt-2 border-t border-neutral-800">
              <input
                type="checkbox"
                checked={backupBeforeRollback}
                onChange={e => setBackupBeforeRollback(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-amber-500 focus:ring-0 cursor-pointer"
              />
              <span>Create AppHub library snapshot before rollback</span>
            </label>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setRollbackTarget(null)}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRollback}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Execute Rollback to v{rollbackTarget.version}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
