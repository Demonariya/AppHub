import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  TaskAction,
  AppSettings,
  CustomCollection,
  PackageSource,
  InstallationTask,
  CategoryType,
} from './types';
import { storage } from './services/storage';
import { installationQueue } from './services/installationQueue';
import { wingetEngine } from './services/wingetEngine';
import { TitleBar } from './components/layout/TitleBar';
import { Sidebar, PageId } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { LiveTerminalDrawer } from './components/common/LiveTerminalDrawer';
import { AppDetailsModal } from './components/modals/AppDetailsModal';
import { UACConfirmModal } from './components/modals/UACConfirmModal';
import { QuickSearchModal } from './components/modals/QuickSearchModal';

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

export default function App() {
  // State
  const [currentPage, setCurrentPage] = useState<PageId>('home');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | null>(null);
  const [packages, setPackages] = useState<Package[]>([]);
  const [sources, setSources] = useState<PackageSource[]>([]);
  const [collections, setCollections] = useState<CustomCollection[]>([]);
  const [settings, setSettings] = useState<AppSettings>(storage.getSettings());
  const [queue, setQueue] = useState<InstallationTask[]>([]);
  const [activeTask, setActiveTask] = useState<InstallationTask | null>(null);
  const [historyTasks, setHistoryTasks] = useState<InstallationTask[]>([]);

  // Modals & Drawers
  const [detailedPackage, setDetailedPackage] = useState<Package | null>(null);
  const [uacPackage, setUacPackage] = useState<{ pkg: Package; action: TaskAction } | null>(null);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Initialize data
  useEffect(() => {
    setPackages(storage.getPackages());
    setSources(storage.getSources());
    setCollections(storage.getCollections());
    setSettings(storage.getSettings());
    setHistoryTasks(storage.getHistoryTasks());

    // Subscribe to installation queue
    const unsubscribe = installationQueue.subscribe((q, active) => {
      setQueue(q);
      setActiveTask(active);
      setHistoryTasks(storage.getHistoryTasks());
      setPackages(storage.getPackages());
    });

    return () => unsubscribe();
  }, []);

  // Theme synchronization with html class
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [settings.theme]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: Quick search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen(prev => !prev);
      }
      // Ctrl+R: Refresh WinGet
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        handleSyncWinGet();
      }
      // Ctrl+` or Ctrl+T: Toggle CLI Terminal
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.key.toLowerCase() === 't')) {
        e.preventDefault();
        setTerminalOpen(prev => !prev);
      }
      // Esc: Close open modals
      if (e.key === 'Escape') {
        if (quickSearchOpen) setQuickSearchOpen(false);
        else if (uacPackage) setUacPackage(null);
        else if (detailedPackage) setDetailedPackage(null);
        else if (terminalOpen) setTerminalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [quickSearchOpen, uacPackage, detailedPackage, terminalOpen]);

  const handleSyncWinGet = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setPackages(storage.getPackages());
      setIsSyncing(false);
    }, 800);
  };

  const handleActionClick = (pkg: Package, action: TaskAction, options?: any) => {
    if (settings.requireConfirmation && !options?.forceBypassUac) {
      setUacPackage({ pkg, action });
      return;
    }

    // Direct execution
    executeAction(pkg, action, options);
  };

  const executeAction = (pkg: Package, action: TaskAction, options?: any) => {
    installationQueue.enqueue(pkg, action, {
      silent: options?.silent ?? settings.silentInstall,
      force: options?.force ?? false,
      architecture: settings.preferredArchitecture,
    });

    // Auto-open terminal drawer to give power users immediate feedback
    setTerminalOpen(true);
  };

  const handleUacConfirm = (options: { silent: boolean; force: boolean }) => {
    if (!uacPackage) return;
    executeAction(uacPackage.pkg, uacPackage.action, {
      ...options,
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
    setTerminalOpen(true);
  };

  const handlePinPackage = (pkg: Package, pin: boolean) => {
    const updated = storage.updatePackage(pkg.id, {
      isPinned: pin,
      pinnedVersion: pin ? pkg.installedVersion || pkg.version : undefined,
    });
    if (updated) {
      setPackages(storage.getPackages());
    }
  };

  const handleExcludePackage = (pkg: Package, exclude: boolean) => {
    const updated = storage.updatePackage(pkg.id, {
      isExcludedFromUpdates: exclude,
    });
    if (updated) {
      setPackages(storage.getPackages());
    }
  };

  const handleExportManifest = () => {
    const json = storage.exportWinGetManifest();
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
      // Mark matching packages as favorite or highlight them
      const list = storage.getPackages();
      const set = new Set(result.packageIds);
      const updated = list.map(p => (set.has(p.id) ? { ...p, isFavorite: true } : p));
      storage.savePackages(updated);
      setPackages(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearCache = () => {
    storage.savePackages(storage.getPackages());
    setPackages(storage.getPackages());
  };

  const handleResetDefaults = () => {
    storage.resetAllToDefaults();
    setPackages(storage.getPackages());
    setSources(storage.getSources());
    setCollections(storage.getCollections());
    setSettings(storage.getSettings());
    setHistoryTasks([]);
  };

  const updateCount = packages.filter(
    p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
  ).length;

  const activeDownloadsCount = queue.length + (activeTask ? 1 : 0);

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 overflow-hidden font-sans select-none">
      {/* 1. Windows Fluent TitleBar */}
      <TitleBar
        environment={wingetEngine.getEnvironment()}
        onOpenTerminal={() => setTerminalOpen(!terminalOpen)}
        terminalOpen={terminalOpen}
      />

      {/* Main Workspace Split: Sidebar + Content Canvas */}
      <div className="flex-1 flex overflow-hidden">
        {/* 2. Compact / Responsive Sidebar Navigation */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={page => {
            setCurrentPage(page);
            if (page !== 'categories') setSelectedCategory(null);
          }}
          updatesCount={updateCount}
          activeDownloadsCount={activeDownloadsCount}
          isCompact={isSidebarCompact}
          onToggleCompact={() => setIsSidebarCompact(!isSidebarCompact)}
          isOpenOnMobile={mobileNavOpen}
          onCloseMobile={() => setMobileNavOpen(false)}
        />

        {/* 3. Main Content Viewport */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-neutral-950">
          <TopHeader
            currentPage={currentPage}
            selectedCategory={selectedCategory}
            onOpenQuickSearch={() => setQuickSearchOpen(true)}
            onRefreshCatalog={handleSyncWinGet}
            isRefreshing={isSyncing}
            theme={settings.theme}
            onToggleTheme={() => {
              const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
              const updated = storage.saveSettings({ theme: nextTheme });
              setSettings(updated);
            }}
            onToggleMobileMenu={() => setMobileNavOpen(prev => !prev)}
          />

          {/* Scrollable View Area */}
          <main className="flex-1 overflow-y-auto">
            {currentPage === 'home' && (
              <HomePage
                packages={packages}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
                onNavigateToUpdates={() => setCurrentPage('updates')}
                onNavigateToDiscover={() => setCurrentPage('discover')}
              />
            )}

            {currentPage === 'discover' && (
              <DiscoverPage
                packages={packages}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
                initialCategory={selectedCategory}
              />
            )}

            {currentPage === 'categories' && (
              <CategoriesPage
                packages={packages}
                selectedCategory={selectedCategory}
                onSelectCategory={cat => setSelectedCategory(cat)}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
              />
            )}

            {currentPage === 'installed' && (
              <InstalledPage
                packages={packages}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
                onExportManifest={handleExportManifest}
              />
            )}

            {currentPage === 'updates' && (
              <UpdatesPage
                packages={packages}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
                onUpdateAll={handleUpdateAll}
                onPinPackage={handlePinPackage}
                onExcludePackage={handleExcludePackage}
                onScanUpdates={handleSyncWinGet}
                isScanning={isSyncing}
              />
            )}

            {currentPage === 'downloads' && (
              <DownloadsPage
                queue={queue}
                activeTask={activeTask}
                historyTasks={historyTasks}
                onCancelTask={id => installationQueue.cancel(id)}
                onRetryTask={id => installationQueue.retry(id)}
                onClearHistory={() => {
                  storage.clearHistory();
                  setHistoryTasks([]);
                }}
                onOpenTerminalForTask={() => setTerminalOpen(true)}
              />
            )}

            {currentPage === 'library' && (
              <LibraryPage
                packages={packages}
                collections={collections}
                onOpenDetails={pkg => setDetailedPackage(pkg)}
                onActionClick={handleActionClick}
                onUpdateCollections={cols => setCollections(cols)}
                onExportManifest={handleExportManifest}
                onImportManifest={handleImportManifest}
                onRestoreBackup={() => {
                  setPackages(storage.getPackages());
                  setCollections(storage.getCollections());
                  setSettings(storage.getSettings());
                }}
              />
            )}

            {currentPage === 'sources' && (
              <PackageSourcesPage
                sources={sources}
                onUpdateSources={srcs => setSources(srcs)}
                onRefreshAllSources={handleSyncWinGet}
                isRefreshing={isSyncing}
              />
            )}

            {currentPage === 'settings' && (
              <SettingsPage
                settings={settings}
                environment={wingetEngine.getEnvironment()}
                onUpdateSettings={upd => {
                  const updated = storage.saveSettings(upd);
                  setSettings(updated);
                }}
                onResetDefaults={handleResetDefaults}
                onClearCache={handleClearCache}
              />
            )}
          </main>
        </div>
      </div>

      {/* Floating / Docked Live WinGet CLI Output Terminal */}
      <LiveTerminalDrawer
        isOpen={terminalOpen}
        onClose={() => setTerminalOpen(false)}
        activeTask={activeTask}
        historyTasks={historyTasks}
      />

      {/* Package Details Modal */}
      <AppDetailsModal
        pkg={detailedPackage}
        onClose={() => setDetailedPackage(null)}
        onActionClick={handleActionClick}
      />

      {/* Windows UAC Confirmation Elevation Modal */}
      <UACConfirmModal
        pkg={uacPackage ? uacPackage.pkg : null}
        action={uacPackage ? uacPackage.action : 'install'}
        onConfirm={handleUacConfirm}
        onCancel={() => setUacPackage(null)}
      />

      {/* Global Quick Search Overlay (Ctrl+K) */}
      <QuickSearchModal
        isOpen={quickSearchOpen}
        onClose={() => setQuickSearchOpen(false)}
        packages={packages}
        onSelectPackage={pkg => setDetailedPackage(pkg)}
      />
    </div>
  );
}
