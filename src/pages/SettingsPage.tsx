import React, { useState, useEffect } from 'react';
import {
  AppSettings,
  WinGetEnvironment,
  Architecture,
  PackageSource,
  CatalogCacheStats,
  CatalogSyncRunRecord,
} from '../types';
import {
  Sliders,
  Palette,
  AppWindow,
  HardDriveDownload,
  Bell,
  Terminal,
  Keyboard,
  Info,
  RotateCcw,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Database,
  FileText,
  X,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  CollapsibleSection,
  ConfirmationDialog,
  StatusBadge,
  useToast,
} from '../components/ui';
import { CatalogSyncLogDialog } from '../components/common/CatalogSyncBanner';
import { formatBytes } from '../services/catalog';

interface SettingsPageProps {
  settings: AppSettings;
  environment: WinGetEnvironment;
  sources: PackageSource[];
  catalogStats: CatalogCacheStats;
  syncHistory: CatalogSyncRunRecord[];
  isCatalogSyncing: boolean;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onResetDefaults: () => void;
  onClearCache: () => void;
  onStartCatalogSync: (targetSources?: string[]) => void;
  onCancelCatalogSync: () => void;
  onRefreshEnvironment?: (explicitPath?: string) => Promise<void> | void;
  isRefreshingEnvironment?: boolean;
}

type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'catalog'
  | 'applications'
  | 'downloads'
  | 'notifications'
  | 'diagnostics'
  | 'shortcuts'
  | 'about';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  environment,
  sources,
  catalogStats,
  syncHistory,
  isCatalogSyncing,
  onUpdateSettings,
  onResetDefaults,
  onClearCache,
  onStartCatalogSync,
  onCancelCatalogSync,
  onRefreshEnvironment,
  isRefreshingEnvironment = false,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsSectionId>('appearance');
  const [wingetPathDraft, setWingetPathDraft] = useState(settings.wingetPath || '');
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmClearCacheOpen, setConfirmClearCacheOpen] = useState(false);
  const [syncLogOpen, setSyncLogOpen] = useState(false);

  useEffect(() => {
    setWingetPathDraft(settings.wingetPath || '');
  }, [settings.wingetPath]);

  const handleToggle = (key: keyof AppSettings, label?: string) => {
    const updated = !settings[key];
    onUpdateSettings({ [key]: updated });
    showToast({
      title: label ? `${label} ${updated ? 'enabled' : 'disabled'}` : 'Preference saved',
      tone: 'success',
    });
  };

  const handleToggleSyncSource = (sourceName: string) => {
    const allNames = sources.map(s => s.name);
    const current =
      settings.enabledSyncSources && settings.enabledSyncSources.length > 0
        ? settings.enabledSyncSources
        : allNames;
    const isCurrentlyEnabled = current.some(n => n.toLowerCase() === sourceName.toLowerCase());
    const next = isCurrentlyEnabled
      ? current.filter(n => n.toLowerCase() !== sourceName.toLowerCase())
      : [...current, sourceName];
    onUpdateSettings({ enabledSyncSources: next });
    showToast({
      title: `${sourceName} sync ${isCurrentlyEnabled ? 'disabled' : 'enabled'}`,
      tone: 'success',
    });
  };

  const handleApplyWingetPath = async () => {
    const cleaned = wingetPathDraft.trim();
    onUpdateSettings({ wingetPath: cleaned });
    if (onRefreshEnvironment) {
      await onRefreshEnvironment(cleaned);
    }
    showToast({
      title: cleaned ? 'Custom WinGet Path Saved' : 'Restored Auto-Detect Path',
      tone: 'success',
    });
  };

  const navTabs: { id: SettingsSectionId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'general', label: 'General & Startup', icon: Sliders },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'catalog', label: 'Catalog Synchronization', icon: Database },
    { id: 'applications', label: 'Applications & WinGet', icon: AppWindow },
    { id: 'downloads', label: 'Downloads & Cache', icon: HardDriveDownload },
    { id: 'notifications', label: 'Notifications & Privacy', icon: Bell },
    { id: 'diagnostics', label: 'Diagnostics & CLI', icon: Terminal },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
    { id: 'about', label: 'About AppHub', icon: Info },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Settings"
        subtitle="Configure AppHub appearance, automatic WinGet catalog sync, CLI behavior, and diagnostics."
        actions={
          <Button
            size="md"
            variant="danger"
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            onClick={() => setConfirmResetOpen(true)}
          >
            Reset All to Defaults
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Settings Navigation */}
        <nav
          aria-label="Settings sections"
          className="grid grid-cols-2 sm:grid-cols-4 md:flex md:flex-col gap-1"
        >
          {navTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-xs text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[var(--surface-active)] text-[var(--text-primary)] font-semibold'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] font-medium'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Active Panel */}
        <div className="md:col-span-3 bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[12px] p-6 space-y-6 shadow-[var(--shadow-card)]">
          {/* General & Startup */}
          {activeTab === 'general' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                General &amp; Startup Behavior
              </h2>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.checkUpdatesOnStartup}
                  onChange={() => handleToggle('checkUpdatesOnStartup', 'Startup update scan')}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Scan for Updates on Launch
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    Runs <code className="font-mono text-[var(--accent-primary)]">winget upgrade</code> automatically when AppHub starts in desktop mode.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.requireConfirmation}
                  onChange={() => handleToggle('requireConfirmation', 'Confirmation prompt')}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Confirm Before Installing or Uninstalling
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                    Opens a confirmation dialog showing target version, WinGet flags, and optional custom install directory before execution.
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* Appearance */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                Visual Appearance &amp; Density
              </h2>

              <div>
                <div className="text-xs font-medium text-[var(--text-primary)] mb-2">
                  Color Theme
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'dark', label: 'Dark Graphite', desc: 'Restrained dark desktop surface' },
                    { id: 'light', label: 'Fluent Light', desc: 'High-clarity daylight palette' },
                    { id: 'system', label: 'Match Windows', desc: 'Follow OS theme preference' },
                  ].map(t => {
                    const selected = settings.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onUpdateSettings({ theme: t.id as AppSettings['theme'] });
                          showToast({ title: `Theme set to ${t.label}`, tone: 'success' });
                        }}
                        className={`p-4 rounded-[10px] border text-left transition-all cursor-pointer ${
                          selected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          {t.label}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {t.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <div className="text-xs font-medium text-[var(--text-primary)] mb-2">
                  Layout Density
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      id: 'comfortable',
                      label: 'Comfortable',
                      desc: 'Standard spacing for catalog browsing',
                    },
                    {
                      id: 'compact',
                      label: 'Compact',
                      desc: 'Higher information density for power users',
                    },
                  ].map(d => {
                    const selected = settings.density === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          onUpdateSettings({ density: d.id as AppSettings['density'] });
                          showToast({ title: `Density set to ${d.label}`, tone: 'success' });
                        }}
                        className={`p-4 rounded-[10px] border text-left transition-all cursor-pointer ${
                          selected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-soft)]'
                            : 'border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[var(--text-primary)]">
                          {d.label}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {d.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Catalog Synchronization */}
          {activeTab === 'catalog' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    WinGet Catalog Synchronization
                  </h2>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Configure background package discovery from your installed WinGet repositories.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<FileText className="w-3.5 h-3.5" />}
                    onClick={() => setSyncLogOpen(true)}
                  >
                    View Sync Log
                  </Button>
                  {isCatalogSyncing ? (
                    <Button
                      size="sm"
                      variant="danger"
                      leftIcon={<X className="w-3.5 h-3.5" />}
                      onClick={onCancelCatalogSync}
                    >
                      Cancel Sync
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                      onClick={() => onStartCatalogSync()}
                    >
                      Sync Catalog Now
                    </Button>
                  )}
                </div>
              </div>

              {/* Cache Diagnostics Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">Cached Packages</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                    {catalogStats.availablePackages}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">Enriched Metadata</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                    {catalogStats.enrichedPackages}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">Last Complete Sync</div>
                  <div className="text-xs font-semibold text-[var(--text-primary)] mt-1 truncate">
                    {catalogStats.lastSyncAt
                      ? new Date(catalogStats.lastSyncAt).toLocaleString()
                      : 'Never'}
                  </div>
                </div>
                <div className="p-3 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">SQLite Footprint</div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                    {catalogStats.dbSizeBytes > 0 ? formatBytes(catalogStats.dbSizeBytes) : '—'}
                  </div>
                </div>
              </div>

              {/* Sync Toggles */}
              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.autoSyncCatalog}
                    onChange={() => handleToggle('autoSyncCatalog', 'Automatic catalog synchronization')}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Enable Automatic Catalog Synchronization
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Automatically refreshes package listings when cache is empty, stale, or sources change.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.syncCatalogOnStartup}
                    onChange={() => handleToggle('syncCatalogOnStartup', 'Startup catalog sync')}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Check Catalog Freshness on Startup
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Verifies cache age against the refresh interval when launching AppHub.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.sourceAgreementsAccepted}
                    onChange={() => handleToggle('sourceAgreementsAccepted', 'WinGet source agreements')}
                    className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      WinGet Source Agreements Accepted
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      Authorizes passing <code className="font-mono text-[var(--accent-primary)]">--accept-source-agreements</code> during catalog synchronization.
                    </div>
                  </div>
                </label>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <label className="text-xs font-medium text-[var(--text-primary)] block mb-1.5">
                  Refresh Interval
                </label>
                <select
                  value={settings.catalogRefreshIntervalHours || 24}
                  onChange={e => {
                    onUpdateSettings({ catalogRefreshIntervalHours: Number(e.target.value) });
                    showToast({ title: 'Catalog refresh interval updated', tone: 'success' });
                  }}
                  className="w-full sm:w-72 h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                >
                  <option value={6}>Every 6 hours</option>
                  <option value={12}>Every 12 hours</option>
                  <option value={24}>Every 24 hours (Default)</option>
                  <option value={72}>Every 3 days</option>
                  <option value={168}>Weekly (7 days)</option>
                </select>
              </div>

              {/* Per-Source Toggles */}
              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-2.5">
                <div className="text-xs font-medium text-[var(--text-primary)]">
                  Sources Included in Catalog Sync
                </div>
                {sources.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    No sources discovered yet. Sync or refresh sources in Desktop mode to configure per-source filters.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sources.map(src => {
                      const activeList = settings.enabledSyncSources || [];
                      const isEnabled =
                        activeList.length === 0 ||
                        activeList.some(n => n.toLowerCase() === src.name.toLowerCase());
                      return (
                        <label
                          key={src.id}
                          className="flex items-center justify-between gap-3 p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isEnabled}
                              onChange={() => handleToggleSyncSource(src.name)}
                              className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="font-semibold text-[var(--text-primary)]">
                                {src.name}
                              </span>
                              <span className="ml-2 font-mono text-[11px] text-[var(--text-muted)]">
                                {src.arg}
                              </span>
                            </div>
                          </div>
                          {src.packageCount !== undefined && (
                            <span className="font-mono text-[11px] text-[var(--text-secondary)] shrink-0 tabular-nums">
                              {src.packageCount} pkgs
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Clear Synchronized Catalog Cache
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Removes cached catalog packages and sync history from SQLite while preserving your favorites, collections, settings, and installation logs.
                  </div>
                </div>
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setConfirmClearCacheOpen(true)}
                >
                  Clear Catalog Cache
                </Button>
              </div>
            </div>
          )}

          {/* Applications & WinGet */}
          {activeTab === 'applications' && (
            <div className="space-y-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                Applications &amp; WinGet Execution
              </h2>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.silentInstall}
                  onChange={() => handleToggle('silentInstall', 'Silent installation')}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Silent Installation (<code className="font-mono text-[var(--accent-primary)]">--silent</code>)
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Suppresses interactive setup wizards when supported by the package installer.
                  </div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.autoAcceptAgreements}
                  onChange={() => handleToggle('autoAcceptAgreements', 'Auto-accept agreements')}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Auto-Accept Package &amp; Source Agreements
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Passes <code className="font-mono text-[var(--accent-primary)]">--accept-package-agreements --accept-source-agreements</code> to prevent CLI hangs.
                  </div>
                </div>
              </label>

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <label className="text-xs font-medium text-[var(--text-primary)] block mb-1.5">
                  Preferred Package Architecture
                </label>
                <select
                  value={settings.preferredArchitecture}
                  onChange={e => {
                    onUpdateSettings({ preferredArchitecture: e.target.value as Architecture });
                    showToast({ title: 'Architecture preference updated', tone: 'success' });
                  }}
                  className="w-full sm:w-72 h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                >
                  <option value="x64">x64 (AMD64 64-bit)</option>
                  <option value="arm64">ARM64 (Windows on ARM)</option>
                  <option value="x86">x86 (32-bit Legacy)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-[var(--text-primary)]">
                      Default Custom Install Directory
                    </div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Automatically pass <code className="font-mono text-[var(--accent-primary)]">--location</code> during installations.
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={settings.useCustomLocationByDefault || false}
                      onChange={() =>
                        handleToggle('useCustomLocationByDefault', 'Default custom directory')
                      }
                      className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <span className="font-mono text-[11px]">Enable by default</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={settings.defaultCustomLocation || ''}
                    onChange={e => onUpdateSettings({ defaultCustomLocation: e.target.value })}
                    placeholder="e.g. D:\Software or C:\Apps"
                    className="flex-1 min-w-[200px] h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => {
                      onUpdateSettings({ defaultCustomLocation: 'D:\\Software' });
                      showToast({ title: 'Default location set to D:\\Software', tone: 'success' });
                    }}
                  >
                    D:\Software
                  </Button>
                  <Button
                    size="md"
                    variant="secondary"
                    onClick={() => {
                      onUpdateSettings({ defaultCustomLocation: 'C:\\Program Files' });
                      showToast({
                        title: 'Default location set to C:\\Program Files',
                        tone: 'success',
                      });
                    }}
                  >
                    C:\Program Files
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Downloads & Cache */}
          {activeTab === 'downloads' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                Downloads &amp; Local Cache
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-[var(--text-primary)] block mb-1.5">
                    Concurrent Installations Limit
                  </label>
                  <select
                    value={settings.maxConcurrentDownloads || 1}
                    onChange={e => {
                      onUpdateSettings({ maxConcurrentDownloads: Number(e.target.value) });
                      showToast({ title: 'Concurrency limit updated', tone: 'success' });
                    }}
                    className="w-full h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                  >
                    <option value={1}>1 task at a time (Safest for MSI locks)</option>
                    <option value={2}>2 parallel tasks</option>
                    <option value={3}>3 parallel tasks</option>
                    <option value={4}>4 parallel tasks</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--text-primary)] block mb-1.5">
                    Operation Log Retention
                  </label>
                  <select
                    value={settings.logRetentionDays || 30}
                    onChange={e => {
                      onUpdateSettings({ logRetentionDays: Number(e.target.value) });
                      showToast({ title: 'Retention period updated', tone: 'success' });
                    }}
                    className="w-full h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] cursor-pointer"
                  >
                    <option value={7}>7 days</option>
                    <option value={30}>30 days (Default)</option>
                    <option value={90}>90 days</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Clear Package &amp; Icon Cache
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Clears cached catalog metadata and icon URLs without touching your favorites, collections, settings, or history.
                  </div>
                </div>
                <Button
                  size="md"
                  variant="secondary"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setConfirmClearCacheOpen(true)}
                >
                  Clear Cache
                </Button>
              </div>
            </div>
          )}

          {/* Notifications & Privacy */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                Notifications &amp; Privacy
              </h2>

              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={settings.desktopNotifications}
                  onChange={() => handleToggle('desktopNotifications', 'Desktop notifications')}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] mt-0.5 cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Windows Desktop Notifications
                  </div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    Send native desktop notifications when package installations, updates, or removals finish.
                  </div>
                </div>
              </label>

              <div className="p-4 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-[var(--status-success-fg)] shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-[var(--text-primary)]">
                    Local-First Privacy Guarantee
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                    AppHub includes zero telemetry SDKs, analytics trackers, or remote accounts. All preferences, collections, synchronized catalog records, and operation logs remain strictly on your device in local SQLite storage.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Diagnostics & Advanced CLI */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  WinGet Host Diagnostics
                </h2>
                {onRefreshEnvironment && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={isRefreshingEnvironment}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                    onClick={() => onRefreshEnvironment()}
                  >
                    Re-check Host
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-4 bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)] mb-1">WinGet CLI Status</div>
                  <StatusBadge
                    status={environment.isInstalled ? 'completed' : 'cancelled'}
                    label={environment.isInstalled ? 'Installed & Ready' : 'Not Detected'}
                    compact
                  />
                </div>

                <div className="p-4 bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">WinGet Version</div>
                  <div className="text-[var(--text-primary)] font-semibold mt-1">
                    {environment.version}
                  </div>
                </div>

                <div className="p-4 bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)] sm:col-span-2">
                  <div className="text-[var(--text-muted)]">Resolved Executable</div>
                  <div className="text-[var(--text-primary)] mt-1 truncate">
                    {environment.path || 'Not resolved'}
                  </div>
                </div>

                <div className="p-4 bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">Operating System</div>
                  <div className="text-[var(--text-primary)] mt-1">{environment.windowsVersion}</div>
                </div>

                <div className="p-4 bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)]">
                  <div className="text-[var(--text-muted)]">System Architecture</div>
                  <div className="text-[var(--text-primary)] uppercase mt-1">
                    {environment.architecture}
                  </div>
                </div>
              </div>

              {!environment.isInstalled && (
                <div className="p-4 rounded-[10px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] space-y-2 text-xs">
                  <div className="flex items-center gap-2 text-[var(--status-warning-fg)] font-semibold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>WinGet Remediation</span>
                  </div>
                  <p className="text-[var(--text-primary)] leading-relaxed">
                    Install or update Microsoft App Installer from Microsoft Store or{' '}
                    <a
                      href="https://aka.ms/getwinget"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent-primary)] hover:underline inline-flex items-center gap-1"
                    >
                      aka.ms/getwinget <ExternalLink className="w-3 h-3" />
                    </a>
                    .
                  </p>
                  {environment.error && (
                    <div className="text-[11px] font-mono text-[var(--status-warning-fg)]">
                      {environment.error}
                    </div>
                  )}
                </div>
              )}

              <CollapsibleSection
                title="Advanced: Custom WinGet Executable Override"
                subtitle="Leave blank to auto-detect winget.exe from WindowsApps or PATH"
                icon={<Terminal className="w-4 h-4" />}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={wingetPathDraft}
                    onChange={e => setWingetPathDraft(e.target.value)}
                    placeholder="Auto-detect (e.g. C:\Users\...\WindowsApps\winget.exe)"
                    className="flex-1 min-w-[220px] h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                  <Button
                    size="md"
                    variant="primary"
                    loading={isRefreshingEnvironment}
                    onClick={handleApplyWingetPath}
                  >
                    Apply &amp; Test Path
                  </Button>
                </div>
              </CollapsibleSection>
            </div>
          )}

          {/* Keyboard Shortcuts */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] pb-3 border-b border-[var(--border-subtle)]">
                Keyboard Shortcuts
              </h2>

              <div className="divide-y divide-[var(--border-subtle)]">
                {[
                  { keys: ['Ctrl', 'K'], desc: 'Open instant package search' },
                  { keys: ['Ctrl', 'R'], desc: 'Sync installed apps & updates with WinGet' },
                  { keys: ['Ctrl', '1'], desc: 'Navigate to Home' },
                  { keys: ['Ctrl', '2'], desc: 'Navigate to Explore' },
                  { keys: ['Ctrl', '3'], desc: 'Navigate to Categories' },
                  { keys: ['Ctrl', '4'], desc: 'Navigate to Installed' },
                  { keys: ['Ctrl', '5'], desc: 'Navigate to Updates' },
                  { keys: ['Ctrl', '`'], desc: 'Toggle WinGet CLI console' },
                  { keys: ['Esc'], desc: 'Dismiss active modal or dialog' },
                ].map((s, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="text-[var(--text-primary)]">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map(k => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 rounded-[5px] bg-[var(--surface-subtle)] border border-[var(--border-strong)] text-[var(--text-primary)] font-mono text-[11px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* About */}
          {activeTab === 'about' && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 pb-4 border-b border-[var(--border-subtle)]">
                <div className="w-12 h-12 rounded-[12px] bg-[var(--accent-primary)] flex items-center justify-center text-xl font-bold text-[var(--accent-primary-contrast)]">
                  A
                </div>
                <div>
                  <h2 className="text-base font-bold text-[var(--text-primary)]">AppHub</h2>
                  <p className="text-xs text-[var(--text-secondary)] font-mono">
                    Version 0.1.0 · Windows x64 · Rust / Tauri 2
                  </p>
                </div>
              </div>

              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                AppHub is an open-source Windows software store and package manager powered by the Microsoft WinGet CLI, built with Rust, Tauri 2, SQLite, React, and Tailwind CSS.
              </p>

              <div className="space-y-2 text-xs font-mono text-[var(--text-secondary)] pt-1">
                <div>License: Apache-2.0</div>
                <div>
                  Source:{' '}
                  <a
                    href="https://github.com/Demonariya/AppHub"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--accent-primary)] hover:underline"
                  >
                    github.com/Demonariya/AppHub
                  </a>
                </div>
                <div>Runtime Dependency: Microsoft Windows Package Manager (winget)</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={confirmResetOpen}
        onCancel={() => setConfirmResetOpen(false)}
        onConfirm={() => {
          onResetDefaults();
          setConfirmResetOpen(false);
          showToast({ title: 'All Settings Reset to Defaults', tone: 'info' });
        }}
        title="Reset All Preferences"
        description="Restore all settings, favorites, custom collections, and history back to clean defaults?"
        confirmLabel="Reset Everything"
        tone="danger"
      />

      <ConfirmationDialog
        isOpen={confirmClearCacheOpen}
        onCancel={() => setConfirmClearCacheOpen(false)}
        onConfirm={() => {
          onClearCache();
          setConfirmClearCacheOpen(false);
          showToast({ title: 'Catalog & Icon Cache Cleared', tone: 'success' });
        }}
        title="Clear Catalog Cache"
        description="Remove synchronized package records and cached icons from SQLite? Your favorites, custom collections, settings, and installation history will be preserved."
        confirmLabel="Clear Cache"
        tone="warning"
      />

      <CatalogSyncLogDialog
        isOpen={syncLogOpen}
        onClose={() => setSyncLogOpen(false)}
        syncHistory={syncHistory}
        catalogStats={catalogStats}
      />
    </div>
  );
};
