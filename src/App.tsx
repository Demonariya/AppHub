import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Package,
  TaskAction,
  AppSettings,
  CustomCollection,
  PackageSource,
  InstallationTask,
  CategoryType,
  WinGetEnvironment,
  CatalogCacheStats,
  CatalogSyncProgress,
  CatalogSyncResult,
  CatalogSyncRunRecord,
} from './types';
import { storage } from './services/storage';
import { getPackageKey, isCatalogCacheStale } from './services/catalog';
import { installationQueue } from './services/installationQueue';
import { wingetEngine } from './services/wingetEngine';
import { isTauriEnvironment } from './services/tauriBridge';
import { clearPersistentIconCache } from './services/icons';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar, PageId } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { LiveTerminalDrawer } from './components/common/LiveTerminalDrawer';
import { AppDetailsModal } from './components/modals/AppDetailsModal';
import { UACConfirmModal } from './components/modals/UACConfirmModal';
import { QuickSearchModal } from './components/modals/QuickSearchModal';
import { ToastProvider, ErrorState } from './components/ui';

// Pages
import { HomePage } from './pages/HomePage';
import { DiscoverPage } from './pages/DiscoverPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { InstalledPage } from './pages/InstalledPage';
import { UpdatesPage } from './pages/UpdatesPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { LibraryPage } from './pages/LibraryPage';
import { PackageSourcesPage } from './pages/PackageSourcesPage';
import { SettingsPage } from './pages/SettingsPage';

function AppShellContent() {
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [packages, setPackages] = useState<Package[]>(() => storage.getPackages());
  const [sources, setSources] = useState<PackageSource[]>(() => storage.getSources());
  const [collections, setCollections] = useState<CustomCollection[]>(() => storage.getCollections());
  const [settings, setSettings] = useState<AppSettings>(() => storage.getSettings());
  const [environment, setEnvironment] = useState<WinGetEnvironment>(() =>
    wingetEngine.getEnvironment()
  );

  const [queue, setQueue] = useState<InstallationTask[]>([]);
  const [activeTasks, setActiveTasks] = useState<InstallationTask[]>([]);
  const [activeTask, setActiveTask] = useState<InstallationTask | null>(null);
  const [historyTasks, setHistoryTasks] = useState<InstallationTask[]>(() =>
    storage.getHistoryTasks()
  );

  // Catalog Synchronization State
  const [isCatalogSyncing, setIsCatalogSyncing] = useState(false);
  const [catalogSyncProgress, setCatalogSyncProgress] = useState<CatalogSyncProgress | null>(null);
  const [lastCatalogSyncResult, setLastCatalogSyncResult] = useState<CatalogSyncResult | null>(null);
  const [catalogStats, setCatalogStats] = useState<CatalogCacheStats>(() =>
    storage.getCatalogCacheStats()
  );
  const [syncHistory, setSyncHistory] = useState<CatalogSyncRunRecord[]>(() =>
    storage.getCatalogSyncHistory()
  );

  // Modals & Drawers
  const [detailedPackageKey, setDetailedPackageKey] = useState<string | null>(null);
  const [uacPackage, setUacPackage] = useState<{
    pkg: Package;
    action: TaskAction;
    customLocation?: string;
    targetVersion?: string;
    silent?: boolean;
    force?: boolean;
  } | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [inspectedTaskId, setInspectedTaskId] = useState<string | null>(null);
  const [isSidebarCompact, setIsSidebarCompact] = useState<boolean>(() => {
    try {
      return localStorage.getItem('apphub_sidebar_compact') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingEnv, setIsRefreshingEnv] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  const hasAutoSyncedRef = useRef(false);
  const catalogSyncInFlightRef = useRef(false);

  const detailedPackage = detailedPackageKey
    ? packages.find(p => (p.packageKey || getPackageKey(p.id, p.source)) === detailedPackageKey) ||
      packages.find(p => p.id === detailedPackageKey) ||
      null
    : null;

  const openPackageDetails = useCallback((pkg: Package) => {
    setDetailedPackageKey(pkg.packageKey || getPackageKey(pkg.id, pkg.source));
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty(
        '--sidebar-width',
        isSidebarCompact ? '64px' : '224px'
      );
    }
  }, [isSidebarCompact]);

  const handleToggleSidebarCompact = () => {
    setIsSidebarCompact(prev => {
      const next = !prev;
      try {
        localStorage.setItem('apphub_sidebar_compact', String(next));
      } catch {
        // Ignore storage errors
      }
      return next;
    });
  };

  const syncWinGetInventory = useCallback(
    async (options: { includeUpgrades?: boolean; includeSources?: boolean } = {}) => {
      setSyncError(null);
      setIsSyncing(true);
      try {
        const env = await wingetEngine.refreshEnvironment();
        setEnvironment(env);

        if (!isTauriEnvironment() || !env.isInstalled) {
          setPackages(storage.getPackages());
          setIsSyncing(false);
          return { env, discoveredSourceNames: [] as string[] };
        }

        const [installedRes, upgradesRes, sourcesRes] = await Promise.allSettled([
          wingetEngine.listInstalledPackages(),
          options.includeUpgrades !== false
            ? wingetEngine.listAvailableUpgrades()
            : Promise.resolve([]),
          options.includeSources !== false ? wingetEngine.getSources() : Promise.resolve(null),
        ]);

        const installedList = installedRes.status === 'fulfilled' ? installedRes.value : [];
        const upgradeList = upgradesRes.status === 'fulfilled' ? upgradesRes.value : [];

        if (installedRes.status === 'rejected') {
          setSyncError(
            `Failed to query installed packages: ${installedRes.reason?.message || installedRes.reason}`
          );
        } else if (upgradesRes.status === 'rejected') {
          setSyncError(
            `Failed to check available upgrades: ${upgradesRes.reason?.message || upgradesRes.reason}`
          );
        }

        if (installedRes.status === 'fulfilled' || upgradesRes.status === 'fulfilled') {
          const merged = storage.mergeRealSystemState(installedList, upgradeList);
          setPackages(merged);
        }

        let discoveredSourceNames: string[] = [];
        if (sourcesRes.status === 'fulfilled' && sourcesRes.value) {
          discoveredSourceNames = sourcesRes.value.map(s => s.name);
          const existingByName = new Map(storage.getSources().map(s => [s.name.toLowerCase(), s]));
          const mappedSources: PackageSource[] = sourcesRes.value.map(s => {
            const prev = existingByName.get(s.name.toLowerCase());
            return {
              id: s.name.toLowerCase(),
              name: s.name,
              arg: s.argument,
              type: s.name === 'msstore' ? 'msstore' : s.name === 'winget' ? 'winget' : 'custom',
              sourceType: s.sourceType,
              isOfficial: s.isOfficial,
              isEnabled: prev?.isEnabled !== false,
              lastSyncAt: prev?.lastSyncAt,
              lastUpdated: prev?.lastUpdated,
              lastStatus: prev?.lastStatus,
              lastError: prev?.lastError,
              packageCount: prev?.packageCount,
              isComplete: prev?.isComplete,
              trustLevel: s.isOfficial ? 'verified' : 'community',
            };
          });
          storage.saveSources(mappedSources);
          setSources(mappedSources);
        }

        return { env, discoveredSourceNames };
      } catch (err: any) {
        setSyncError(err?.message || String(err));
        return { env: wingetEngine.getEnvironment(), discoveredSourceNames: [] as string[] };
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  const handleStartCatalogSync = useCallback(
    async (targetSources?: string[], overrideAcceptAgreements?: boolean) => {
      if (!isTauriEnvironment()) return;
      if (catalogSyncInFlightRef.current) return;

      catalogSyncInFlightRef.current = true;
      setIsCatalogSyncing(true);
      setCatalogSyncProgress({
        runId: 'pending',
        phase: 'discovering-sources',
        sourcesCompleted: 0,
        sourcesTotal: targetSources?.length || 1,
        packagesDiscovered: 0,
        message: 'Discovering configured WinGet sources...',
        isIndeterminate: true,
      });

      try {
        const result = await wingetEngine.syncCatalog({
          targetSources,
          acceptSourceAgreements: overrideAcceptAgreements,
          onProgress: prog => setCatalogSyncProgress(prog),
        });
        setLastCatalogSyncResult(result);

        if (result.agreementRequired && !overrideAcceptAgreements) {
          // Wait for explicit user consent in CatalogSyncBanner
        } else if (overrideAcceptAgreements && !result.agreementRequired && !result.cancelled) {
          const updated = storage.saveSettings({ sourceAgreementsAccepted: true });
          setSettings(updated);
        }

        await storage.hydrateCatalogFromDatabase();
        setSources(storage.getSources());
        setCatalogStats(storage.getCatalogCacheStats());
        setSyncHistory(storage.getCatalogSyncHistory());

        // Re-overlay installed & upgradable inventory on top of refreshed SQLite catalog
        await syncWinGetInventory({ includeUpgrades: true, includeSources: false });
      } catch (err: any) {
        setSyncError(err?.message || String(err));
      } finally {
        catalogSyncInFlightRef.current = false;
        setIsCatalogSyncing(false);
        setCatalogSyncProgress(null);
      }
    },
    [syncWinGetInventory]
  );

  const handleCancelCatalogSync = useCallback(async () => {
    await wingetEngine.cancelCatalogSync();
  }, []);

  const handleAcceptAgreementsAndSync = useCallback(() => {
    const updated = storage.saveSettings({
      sourceAgreementsAccepted: true,
      autoAcceptAgreements: true,
    });
    setSettings(updated);
    void handleStartCatalogSync(undefined, true);
  }, [handleStartCatalogSync]);

  const handlePackageEnriched = useCallback(
    (pkgId: string, source: string, details: Partial<Package>) => {
      const targetKey = getPackageKey(pkgId, source);
      setPackages(prev =>
        prev.map(p => {
          const key = p.packageKey || getPackageKey(p.id, p.source);
          if (key !== targetKey) return p;
          return {
            ...p,
            ...details,
            homepage: details.homepage || p.homepage,
            publisherUrl: details.publisherUrl || p.publisherUrl,
            license: details.license || p.license,
            releaseDate: details.releaseDate || p.releaseDate,
            description: details.description || p.description,
            longDescription: details.longDescription || p.longDescription,
            tags: details.tags && details.tags.length > 0 ? details.tags : p.tags,
            architectures:
              details.architectures && details.architectures.length > 0
                ? details.architectures
                : p.architectures,
            category:
              details.category && details.category !== 'Uncategorized'
                ? details.category
                : p.category,
          };
        })
      );
    },
    []
  );

  // Hydrate SQLite & run initial WinGet sync on mount
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await storage.hydrateFromDatabase();
      if (!mounted) return;

      const hydratedSettings = storage.getSettings();
      const hydratedPackages = storage.getPackages();
      const hydratedStats = storage.getCatalogCacheStats();
      const hydratedSources = storage.getSources();

      setPackages(hydratedPackages);
      setSources(hydratedSources);
      setCollections(storage.getCollections());
      setSettings(hydratedSettings);
      setHistoryTasks(storage.getHistoryTasks());
      setCatalogStats(hydratedStats);
      setSyncHistory(storage.getCatalogSyncHistory());

      const { env, discoveredSourceNames } = await syncWinGetInventory({
        includeUpgrades: hydratedSettings.checkUpdatesOnStartup,
        includeSources: true,
      });

      if (!mounted || hasAutoSyncedRef.current) return;
      hasAutoSyncedRef.current = true;

      const shouldAutoSync =
        isTauriEnvironment() &&
        env.isInstalled &&
        hydratedSettings.autoSyncCatalog &&
        hydratedSettings.syncCatalogOnStartup;

      if (shouldAutoSync) {
        const cachedSourceNames = new Set(
          hydratedSources.filter(s => s.lastSyncAt).map(s => s.name.toLowerCase())
        );
        const sourcesChanged = discoveredSourceNames.some(
          name => !cachedSourceNames.has(name.toLowerCase())
        );
        const nonExternalCatalogCount = storage
          .getPackages()
          .filter(p => !p.isExternal).length;
        const stale = isCatalogCacheStale(
          hydratedStats.lastSyncAt,
          hydratedSettings.catalogRefreshIntervalHours
        );

        if (nonExternalCatalogCount === 0 || stale || sourcesChanged) {
          void handleStartCatalogSync();
        }
      }
    };

    void init();

    const unsubQueue = installationQueue.subscribe((q, actives, primary) => {
      setQueue(q);
      setActiveTasks(actives);
      setActiveTask(primary);
      setHistoryTasks(storage.getHistoryTasks());
      setPackages(storage.getPackages());
    });

    const unsubComplete = installationQueue.onTaskCompleted(async task => {
      const actionVerb =
        task.action === 'uninstall'
          ? 'Uninstall'
          : task.action === 'update'
          ? 'Update'
          : 'Installation';
      if (task.status === 'completed') {
        void wingetEngine.sendNotification(
          `${actionVerb} Completed`,
          `${task.packageName} (${task.packageId}) finished cleanly.`
        );
      } else if (task.status === 'failed') {
        void wingetEngine.sendNotification(
          `${actionVerb} Failed`,
          `${task.packageName}: ${task.error || 'Operation failed'}`
        );
      }

      if (isTauriEnvironment() && task.status === 'completed') {
        await syncWinGetInventory({ includeUpgrades: true, includeSources: false });
      }
    });

    return () => {
      mounted = false;
      unsubQueue();
      unsubComplete();
    };
  }, [syncWinGetInventory, handleStartCatalogSync]);

  // Theme synchronization with dark / light / system
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (mode: AppSettings['theme']) => {
      if (mode === 'light') {
        root.classList.remove('dark');
      } else if (mode === 'dark') {
        root.classList.add('dark');
      } else {
        const prefersDark =
          typeof window !== 'undefined' &&
          window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      }
    };

    applyTheme(settings.theme);

    if (settings.theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  const handleSyncWinGet = useCallback(async () => {
    await syncWinGetInventory({ includeUpgrades: true, includeSources: true });
    if (isTauriEnvironment()) {
      await handleStartCatalogSync();
    }
  }, [syncWinGetInventory, handleStartCatalogSync]);

  const handleRefreshEnvironment = useCallback(async (explicitPath?: string) => {
    setIsRefreshingEnv(true);
    try {
      const env = await wingetEngine.refreshEnvironment(explicitPath);
      setEnvironment(env);
    } finally {
      setIsRefreshingEnv(false);
    }
  }, []);

  // Global Keyboard Shortcuts
  const shortcutRef = useRef({ quickSearchOpen, uacPackage, detailedPackageKey, terminalOpen });
  shortcutRef.current = { quickSearchOpen, uacPackage, detailedPackageKey, terminalOpen };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen(prev => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        void handleSyncWinGet();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key.toLowerCase() === 't')) {
        e.preventDefault();
        setTerminalOpen(prev => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !isInput) {
        const navMap: Record<string, PageId> = {
          '1': 'home',
          '2': 'discover',
          '3': 'categories',
          '4': 'installed',
          '5': 'updates',
        };
        if (navMap[e.key]) {
          e.preventDefault();
          const targetPage = navMap[e.key];
          setCurrentPage(targetPage);
          if (targetPage !== 'categories') setSelectedCategory(null);
          return;
        }
      }

      if (e.key === 'Escape') {
        const cur = shortcutRef.current;
        if (cur.quickSearchOpen) setQuickSearchOpen(false);
        else if (cur.uacPackage) setUacPackage(null);
        else if (cur.detailedPackageKey) setDetailedPackageKey(null);
        else if (cur.terminalOpen) setTerminalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSyncWinGet]);

  const executeAction = (pkg: Package, action: TaskAction, options?: any) => {
    const finalLocation =
      options?.customLocation ||
      (settings.useCustomLocationByDefault && settings.defaultCustomLocation
        ? `${settings.defaultCustomLocation}\\${pkg.name}`
        : undefined);

    installationQueue.enqueue(pkg, action, {
      targetVersion: options?.targetVersion,
      silent: options?.silent ?? settings.silentInstall,
      force: options?.force ?? false,
      architecture: settings.preferredArchitecture,
      customLocation: finalLocation,
    });

    setInspectedTaskId(null);
    setTerminalOpen(true);
  };

  const handleActionClick = (pkg: Package, action: TaskAction, options?: any) => {
    if (pkg.isExternal && action !== 'install') {
      setSyncError(
        `${pkg.name} is an external Windows application (${pkg.id}) not managed by WinGet. Manage it in Windows Settings > Installed apps.`
      );
      return;
    }

    if (settings.requireConfirmation && !options?.forceBypassUac) {
      setUacPackage({
        pkg,
        action,
        customLocation: options?.customLocation,
        targetVersion: options?.targetVersion,
        silent: options?.silent,
        force: options?.force,
      });
      return;
    }

    executeAction(pkg, action, options);
  };

  const handleUacConfirm = (options: { silent: boolean; force: boolean; customLocation?: string }) => {
    if (!uacPackage) return;
    executeAction(uacPackage.pkg, uacPackage.action, {
      targetVersion: uacPackage.targetVersion,
      silent: options.silent,
      force: options.force || uacPackage.force,
      customLocation: options.customLocation ?? uacPackage.customLocation,
      forceBypassUac: true,
    });
    setUacPackage(null);
  };

  const handleUpdateAll = (selectedPackages: Package[]) => {
    for (const pkg of selectedPackages) {
      installationQueue.enqueue(pkg, 'update', {
        silent: settings.silentInstall,
      });
    }
    setInspectedTaskId(null);
    setTerminalOpen(true);
  };

  const handleInstallCollection = (missingPkgs: Package[]) => {
    for (const pkg of missingPkgs) {
      installationQueue.enqueue(pkg, 'install', {
        silent: settings.silentInstall,
        architecture: settings.preferredArchitecture,
      });
    }
    setInspectedTaskId(null);
    setTerminalOpen(true);
  };

  const handlePinPackage = async (pkg: Package, pin: boolean) => {
    setPinError(null);
    if (!isTauriEnvironment()) {
      setPinError('Pinning packages via `winget pin` requires the Windows desktop runtime.');
      return;
    }
    try {
      const ok = await wingetEngine.pinPackage(
        pkg.id,
        pin,
        pkg.installedVersion || pkg.version
      );
      if (!ok) {
        setPinError(`WinGet could not ${pin ? 'pin' : 'unpin'} ${pkg.name}.`);
        return;
      }
      storage.updatePackage(
        pkg.id,
        {
          isPinned: pin,
          pinnedVersion: pin ? pkg.installedVersion || pkg.version : undefined,
        },
        pkg.source
      );
      setPackages(storage.getPackages());
    } catch (err: any) {
      setPinError(`Pin failed for ${pkg.name}: ${err?.message || String(err)}`);
    }
  };

  const handleExcludePackage = (pkg: Package, exclude: boolean) => {
    const updated = storage.updatePackage(
      pkg.id,
      {
        isExcludedFromUpdates: exclude,
      },
      pkg.source
    );
    if (updated) {
      setPackages(storage.getPackages());
    }
  };

  const handleToggleFavorite = (pkg: Package) => {
    const updated = storage.setFavorite(pkg.id, !pkg.isFavorite);
    setPackages(updated);
  };

  const handleExportManifest = () => {
    const json = storage.exportWinGetManifest(environment.version);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `winget-export-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportManifest = (jsonString: string) => {
    try {
      const result = storage.importWinGetManifest(jsonString);
      for (const id of result.packageIds) {
        storage.setFavorite(id, true);
      }
      setPackages(storage.getPackages());
    } catch (e) {
      setSyncError(`Failed to import WinGet manifest: ${(e as Error).message}`);
    }
  };

  const handleClearCache = async () => {
    await clearPersistentIconCache();
    await storage.clearCatalogCache();
    setLastCatalogSyncResult(null);
    setPackages(storage.getPackages());
    setCatalogStats(storage.getCatalogCacheStats());
    setSyncHistory(storage.getCatalogSyncHistory());
    if (isTauriEnvironment()) {
      await syncWinGetInventory({ includeUpgrades: true, includeSources: true });
    }
  };

  const handleResetDefaults = () => {
    storage.resetAllToDefaults();
    setPackages(storage.getPackages());
    setSources(storage.getSources());
    setCollections(storage.getCollections());
    setSettings(storage.getSettings());
    setCatalogStats(storage.getCatalogCacheStats());
    setSyncHistory([]);
    setLastCatalogSyncResult(null);
    setHistoryTasks([]);
    if (isTauriEnvironment()) {
      void syncWinGetInventory({ includeUpgrades: true, includeSources: true });
    }
  };

  const updateCount = packages.filter(
    p =>
      !p.isExternal &&
      p.isInstalled &&
      p.installedVersion &&
      p.latestVersion &&
      p.installedVersion !== p.latestVersion
  ).length;

  const activeDownloadsCount = queue.length + activeTasks.length;

  return (
    <div
      data-density={settings.density}
      className="h-screen w-screen flex flex-col bg-[var(--surface-canvas)] text-[var(--text-primary)] overflow-hidden font-sans select-none"
    >
      <TitleBar
        environment={environment}
        onOpenTerminal={() => {
          setInspectedTaskId(null);
          setTerminalOpen(prev => !prev);
        }}
        terminalOpen={terminalOpen}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          currentPage={currentPage}
          onSelectPage={page => {
            setCurrentPage(page);
            if (page !== 'categories') setSelectedCategory(null);
          }}
          updatesCount={updateCount}
          activeDownloadsCount={activeDownloadsCount}
          isCompact={isSidebarCompact}
          onToggleCompact={handleToggleSidebarCompact}
          isOpenOnMobile={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[var(--surface-canvas)]">
          <TopHeader
            currentPage={currentPage}
            selectedCategory={selectedCategory}
            onClearCategory={() => setSelectedCategory(null)}
            onOpenQuickSearch={() => setQuickSearchOpen(true)}
            onRefreshCatalog={() => void handleSyncWinGet()}
            onNavigateToActivity={() => setCurrentPage('downloads')}
            activeOperationsCount={activeDownloadsCount}
            isRefreshing={isSyncing || isCatalogSyncing}
            theme={settings.theme}
            onToggleTheme={() => {
              const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
              const updated = storage.saveSettings({ theme: nextTheme });
              setSettings(updated);
            }}
            onToggleMobileMenu={() => setMobileNavOpen(prev => !prev)}
          />

          {syncError && (
            <div className="mx-4 sm:mx-8 mt-3 shrink-0">
              <ErrorState
                title="WinGet Sync Notice"
                message={syncError}
                onDismiss={() => setSyncError(null)}
              />
            </div>
          )}

          <main className="flex-1 overflow-y-auto">
            {currentPage === 'home' && (
              <HomePage
                packages={packages}
                environment={environment}
                isSyncing={isCatalogSyncing}
                syncProgress={catalogSyncProgress}
                lastSyncResult={lastCatalogSyncResult}
                syncHistory={syncHistory}
                catalogStats={catalogStats}
                onStartSync={targetSources => void handleStartCatalogSync(targetSources)}
                onCancelSync={() => void handleCancelCatalogSync()}
                onAcceptAgreementsAndSync={handleAcceptAgreementsAndSync}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onToggleFavorite={handleToggleFavorite}
                onNavigateToUpdates={() => setCurrentPage('updates')}
                onNavigateToDiscover={() => setCurrentPage('discover')}
                onNavigateToCategory={cat => {
                  setSelectedCategory(cat);
                  setCurrentPage('categories');
                }}
                onNavigateToSettings={() => setCurrentPage('settings')}
                onRefreshEnvironment={() => handleRefreshEnvironment()}
                onOpenQuickSearch={() => setQuickSearchOpen(true)}
              />
            )}

            {currentPage === 'discover' && (
              <DiscoverPage
                packages={packages}
                sources={sources}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onToggleFavorite={handleToggleFavorite}
                onPackageEnriched={handlePackageEnriched}
                initialCategory={selectedCategory}
                isSyncing={isCatalogSyncing}
                syncProgress={catalogSyncProgress}
                lastSyncResult={lastCatalogSyncResult}
                syncHistory={syncHistory}
                catalogStats={catalogStats}
                onStartSync={targetSources => void handleStartCatalogSync(targetSources)}
                onCancelSync={() => void handleCancelCatalogSync()}
                onAcceptAgreementsAndSync={handleAcceptAgreementsAndSync}
              />
            )}

            {currentPage === 'categories' && (
              <CategoriesPage
                packages={packages}
                selectedCategory={selectedCategory}
                onSelectCategory={cat => setSelectedCategory(cat)}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onToggleFavorite={handleToggleFavorite}
                isSyncing={isCatalogSyncing}
                onStartSync={() => void handleStartCatalogSync()}
              />
            )}

            {currentPage === 'installed' && (
              <InstalledPage
                packages={packages}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onToggleFavorite={handleToggleFavorite}
                onExportManifest={handleExportManifest}
                onRefreshInstalled={() => void syncWinGetInventory({ includeUpgrades: true })}
                isRefreshing={isSyncing}
              />
            )}

            {currentPage === 'updates' && (
              <UpdatesPage
                packages={packages}
                activeTasks={activeTasks}
                queue={queue}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onUpdateAll={handleUpdateAll}
                onPinPackage={handlePinPackage}
                onExcludePackage={handleExcludePackage}
                onScanUpdates={() => void syncWinGetInventory({ includeUpgrades: true })}
                isScanning={isSyncing}
                pinError={pinError}
              />
            )}

            {currentPage === 'downloads' && (
              <DownloadsPage
                packages={packages}
                queue={queue}
                activeTask={activeTask}
                activeTasks={activeTasks}
                historyTasks={historyTasks}
                onCancelTask={id => void installationQueue.cancel(id)}
                onRetryTask={id => installationQueue.retry(id)}
                onClearQueue={() => installationQueue.clearQueue()}
                onClearHistory={() => {
                  storage.clearHistory();
                  setHistoryTasks([]);
                }}
                onOpenTerminalForTask={task => {
                  setInspectedTaskId(task.id);
                  setTerminalOpen(true);
                }}
              />
            )}

            {currentPage === 'library' && (
              <LibraryPage
                packages={packages}
                collections={collections}
                onOpenDetails={openPackageDetails}
                onActionClick={handleActionClick}
                onToggleFavorite={handleToggleFavorite}
                onUpdateCollections={cols => setCollections(cols)}
                onExportManifest={handleExportManifest}
                onImportManifest={handleImportManifest}
                onInstallCollection={handleInstallCollection}
                onNavigateToDiscover={() => setCurrentPage('discover')}
                onRestoreBackup={() => {
                  setPackages(storage.getPackages());
                  setCollections(storage.getCollections());
                  setSettings(storage.getSettings());
                  setSources(storage.getSources());
                }}
              />
            )}

            {currentPage === 'sources' && (
              <PackageSourcesPage
                sources={sources}
                onUpdateSources={srcs => setSources(srcs)}
                onRefreshAllSources={handleSyncWinGet}
                onSyncSource={sourceName => handleStartCatalogSync([sourceName])}
                isRefreshing={isSyncing || isCatalogSyncing}
              />
            )}

            {currentPage === 'settings' && (
              <SettingsPage
                settings={settings}
                environment={environment}
                sources={sources}
                catalogStats={catalogStats}
                syncHistory={syncHistory}
                isCatalogSyncing={isCatalogSyncing}
                onUpdateSettings={upd => {
                  const updated = storage.saveSettings(upd);
                  setSettings(updated);
                }}
                onResetDefaults={handleResetDefaults}
                onClearCache={() => void handleClearCache()}
                onStartCatalogSync={targetSources => void handleStartCatalogSync(targetSources)}
                onCancelCatalogSync={() => void handleCancelCatalogSync()}
                onRefreshEnvironment={handleRefreshEnvironment}
                isRefreshingEnvironment={isRefreshingEnv}
              />
            )}
          </main>
        </div>
      </div>

      <LiveTerminalDrawer
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        activeTask={activeTask}
        activeTasks={activeTasks}
        queue={queue}
        historyTasks={historyTasks}
        inspectedTaskId={inspectedTaskId}
        onCancelTask={id => void installationQueue.cancel(id)}
      />

      <AppDetailsModal
        pkg={detailedPackage}
        onClose={() => setDetailedPackageKey(null)}
        onActionClick={handleActionClick}
        onToggleFavorite={handleToggleFavorite}
        onPackageEnriched={handlePackageEnriched}
        isActionActive={
          detailedPackage
            ? installationQueue.hasPendingOrActiveForPackage(
                detailedPackage.id,
                detailedPackage.source
              )
            : false
        }
      />

      <UACConfirmModal
        pkg={uacPackage ? uacPackage.pkg : null}
        action={uacPackage ? uacPackage.action : 'install'}
        initialCustomLocation={uacPackage?.customLocation}
        onConfirm={handleUacConfirm}
        onCancel={() => setUacPackage(null)}
      />

      <QuickSearchModal
        isOpen={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        packages={packages}
        onSelectPackage={openPackageDetails}
      />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppShellContent />
    </ToastProvider>
  );
}
