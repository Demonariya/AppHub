import {
  AppSettings,
  CustomCollection,
  InstallationTask,
  Package,
  PackageSource,
  WinGetExportManifest,
} from '../types';
import { INITIAL_PACKAGES, normalizePackageStorage } from './catalog';
import { isTauriEnvironment, tryInvokeCommand } from './tauriBridge';

const SETTINGS_KEY = 'apphub_settings_v1';
const PACKAGES_KEY = 'apphub_packages_v2';
const COLLECTIONS_KEY = 'apphub_collections_v1';
const HISTORY_KEY = 'apphub_history_v1';
const SEARCH_HISTORY_KEY = 'apphub_search_history_v1';
const SOURCES_KEY = 'apphub_sources_v2';
const FAVORITES_KEY = 'apphub_favorites_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  density: 'comfortable',
  silentInstall: true,
  requireConfirmation: true,
  autoAcceptAgreements: true,
  preferredArchitecture: 'x64',
  checkUpdatesOnStartup: true,
  desktopNotifications: true,
  closeToTray: true,
  startWithWindows: false,
  wingetPath: '',
  activeSource: 'winget',
  maxConcurrentDownloads: 1,
  logRetentionDays: 30,
  defaultCustomLocation: '',
  useCustomLocationByDefault: false,
};

export const DEFAULT_SOURCES: PackageSource[] = [
  {
    id: 'winget',
    name: 'winget',
    arg: 'https://cdn.winget.microsoft.com/cache',
    type: 'winget',
    isOfficial: true,
    trustLevel: 'verified',
  },
  {
    id: 'msstore',
    name: 'msstore',
    arg: 'https://storeedgefd.dsx.mp.microsoft.com/v9.0',
    type: 'msstore',
    isOfficial: true,
    trustLevel: 'verified',
  },
];

export const DEFAULT_COLLECTIONS: CustomCollection[] = [
  {
    id: 'col-dev',
    name: 'Developer Workstation',
    description: 'Essential compilers, code editors, runtimes, and command-line utilities.',
    iconName: 'Code',
    packageIds: [
      'Microsoft.VisualStudioCode',
      'Git.Git',
      'Microsoft.WindowsTerminal',
      'Docker.DockerDesktop',
      'OpenJS.NodeJS.LTS',
      'Rustlang.Rustup',
      'BurntSushi.ripgrep.MSVC',
    ],
    createdAt: '2024-11-01',
    updatedAt: '2024-11-20',
  },
  {
    id: 'col-privacy',
    name: 'Privacy & Security Suite',
    description: 'End-to-end encrypted password managers, secure browsers, and local storage tools.',
    iconName: 'ShieldCheck',
    packageIds: [
      'Bitwarden.Bitwarden',
      'KeePassXCTeam.KeePassXC',
      'Mozilla.Firefox',
      'Brave.Brave',
      'Signal.Signal',
      'WireGuard.WireGuard',
    ],
    createdAt: '2024-11-02',
    updatedAt: '2024-11-22',
  },
  {
    id: 'col-productivity',
    name: 'Power Tools & Productivity',
    description: 'Tune Windows 11 with instant search, power toys, and knowledge management.',
    iconName: 'Zap',
    packageIds: [
      'Microsoft.PowerToys',
      'voidtools.Everything',
      'Obsidian.Obsidian',
      'ShareX.ShareX',
      '7zip.7zip',
    ],
    createdAt: '2024-11-03',
    updatedAt: '2024-11-24',
  },
];

class StorageService {
  private memoryFallback: Map<string, string> = new Map();

  private isLocalStorageAvailable(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  }

  private get<T>(key: string, fallback: T): T {
    try {
      if (this.isLocalStorageAvailable()) {
        const data = window.localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
      } else {
        const mem = this.memoryFallback.get(key);
        return mem ? JSON.parse(mem) : fallback;
      }
    } catch {
      return fallback;
    }
  }

  private set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      if (this.isLocalStorageAvailable()) {
        window.localStorage.setItem(key, serialized);
      } else {
        this.memoryFallback.set(key, serialized);
      }
    } catch (e) {
      console.error(`Storage error saving ${key}:`, e);
    }
  }

  /**
   * Hydrates settings, favorites, collections, and operation history from native SQLite on startup.
   */
  public async hydrateFromDatabase(): Promise<void> {
    if (!isTauriEnvironment()) return;

    try {
      const rawSettings = await tryInvokeCommand<Array<[string, string]>>('db_get_all_settings');
      if (rawSettings && rawSettings.length > 0) {
        const current = this.getSettings();
        const patched: Record<string, any> = { ...current };
        for (const [k, rawVal] of rawSettings) {
          try {
            patched[k] = JSON.parse(rawVal);
          } catch {
            patched[k] = rawVal;
          }
        }
        this.set(SETTINGS_KEY, patched);
      }

      const dbFavs = await tryInvokeCommand<string[]>('db_get_favorites');
      if (dbFavs) {
        this.set(FAVORITES_KEY, dbFavs);
        const favSet = new Set(dbFavs);
        const pkgs = this.getPackages().map(p => ({ ...p, isFavorite: favSet.has(p.id) }));
        this.set(PACKAGES_KEY, pkgs);
      }

      const dbCols = await tryInvokeCommand<any[]>('db_get_collections');
      if (dbCols && dbCols.length > 0) {
        const mapped: CustomCollection[] = dbCols.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description || '',
          iconName: c.icon_name || 'Layers',
          packageIds: Array.isArray(c.package_ids) ? c.package_ids : [],
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        }));
        this.set(COLLECTIONS_KEY, mapped);
      } else if (dbCols && dbCols.length === 0) {
        // Seed defaults into SQLite on very first run
        for (const col of this.getCollections()) {
          await this.persistCollectionToDb(col);
        }
      }

      const dbHistory = await tryInvokeCommand<any[]>('db_get_history', { limit: 100 });
      if (dbHistory) {
        const existingLocal = this.getHistoryTasks();
        const localById = new Map(existingLocal.map(t => [t.id, t]));
        const merged: InstallationTask[] = dbHistory.map(r => {
          const local = localById.get(r.id);
          return {
            id: r.id,
            packageId: r.package_id,
            packageName: r.package_name,
            action: (r.action || 'install') as InstallationTask['action'],
            version: r.version,
            targetVersion: local?.targetVersion || r.version,
            status: (r.status || 'completed') as InstallationTask['status'],
            progress: r.status === 'completed' ? 100 : local?.progress ?? 0,
            error: r.error_message || undefined,
            exitCode: r.exit_code ?? local?.exitCode,
            startTime: r.start_time,
            endTime: r.end_time || undefined,
            logs: local?.logs || [],
            flags: local?.flags || {
              silent: true,
              force: false,
              acceptPackageAgreements: true,
              acceptSourceAgreements: true,
            },
          };
        });
        this.set(HISTORY_KEY, merged);
      }
    } catch (err) {
      console.warn('[Storage] SQLite hydration warning:', err);
    }
  }

  public getSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...this.get<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS) };
  }

  public saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    this.set(SETTINGS_KEY, updated);

    if (isTauriEnvironment()) {
      for (const [key, val] of Object.entries(settings)) {
        tryInvokeCommand('db_save_setting', {
          key,
          value: JSON.stringify(val),
        }).catch(() => {});
      }
    }

    return updated;
  }

  public getFavoriteIds(): string[] {
    return this.get<string[]>(FAVORITES_KEY, []);
  }

  public setFavorite(packageId: string, isFavorite: boolean): Package[] {
    const favs = new Set(this.getFavoriteIds());
    if (isFavorite) {
      favs.add(packageId);
    } else {
      favs.delete(packageId);
    }
    this.set(FAVORITES_KEY, Array.from(favs));

    if (isTauriEnvironment()) {
      tryInvokeCommand('db_set_favorite', {
        packageId,
        isFav: isFavorite,
      }).catch(() => {});
    }

    const updated = this.getPackages().map(p =>
      p.id === packageId ? { ...p, isFavorite } : p
    );
    this.savePackages(updated);
    return updated;
  }

  public getPackages(): Package[] {
    const saved = this.get<Package[] | null>(PACKAGES_KEY, null);
    const favSet = new Set(this.getFavoriteIds());
    if (!saved || saved.length === 0) {
      const initial = INITIAL_PACKAGES.map(p => ({
        ...normalizePackageStorage(p),
        isFavorite: favSet.has(p.id),
      }));
      this.set(PACKAGES_KEY, initial);
      return initial;
    }
    return saved.map(p => ({
      ...normalizePackageStorage(p),
      isFavorite: p.isFavorite || favSet.has(p.id),
    }));
  }

  public savePackages(packages: Package[]): void {
    this.set(PACKAGES_KEY, packages);
  }

  public updatePackage(id: string, updates: Partial<Package>): Package | null {
    const list = this.getPackages();
    const idx = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates };
    this.savePackages(list);
    return list[idx];
  }

  public clearPackageCache(): Package[] {
    if (this.isLocalStorageAvailable()) {
      window.localStorage.removeItem(PACKAGES_KEY);
    }
    this.memoryFallback.delete(PACKAGES_KEY);
    return this.getPackages();
  }

  /**
   * Reconciles catalog state against authentic `winget list` & `winget upgrade` output.
   */
  public mergeRealSystemState(
    installedApps: Array<{
      id: string;
      name: string;
      version: string;
      availableVersion?: string;
      source?: string;
      isWingetManaged?: boolean;
    }>,
    upgrades: Array<{
      id: string;
      name: string;
      installedVersion: string;
      availableVersion: string;
      source: string;
    }>
  ): Package[] {
    const existing = this.getPackages();
    const favSet = new Set(this.getFavoriteIds());
    const catalogById = new Map<string, Package>();
    for (const p of existing) {
      catalogById.set(p.id.toLowerCase(), {
        ...p,
        isInstalled: false,
        installedVersion: undefined,
        isExternal: false,
      });
    }

    const upgradeMap = new Map<string, typeof upgrades[0]>();
    for (const u of upgrades) {
      upgradeMap.set(u.id.toLowerCase(), u);
    }

    for (const app of installedApps) {
      const key = app.id.toLowerCase();
      const upg = upgradeMap.get(key);
      const isExternal = app.isWingetManaged === false || !app.source;
      const latestVer = upg?.availableVersion || app.availableVersion || app.version;

      const match = catalogById.get(key);
      if (match) {
        catalogById.set(key, {
          ...match,
          isInstalled: true,
          installedVersion: app.version,
          latestVersion: latestVer || match.latestVersion,
          isExternal,
          isFavorite: match.isFavorite || favSet.has(match.id),
        });
      } else {
        catalogById.set(key, {
          id: app.id,
          name: app.name,
          publisher: isExternal ? 'Local Windows Application' : app.id.split('.')[0] || 'Unknown',
          version: latestVer,
          latestVersion: latestVer,
          description: isExternal
            ? `Detected on Windows (${app.id}). Managed outside WinGet repository.`
            : `Installed package (${app.id}) detected via WinGet.`,
          category: 'Utilities',
          tags: isExternal ? ['external', 'installed'] : ['winget', 'installed'],
          source: isExternal
            ? 'external'
            : app.source === 'msstore'
            ? 'msstore'
            : app.source === 'winget' || !app.source
            ? 'winget'
            : 'custom',
          architectures: ['x64'],
          license: 'Installed Locally',
          homepage: '',
          releaseDate: '',
          verified: !isExternal,
          isInstalled: true,
          installedVersion: app.version,
          isExternal,
          isFavorite: favSet.has(app.id),
        });
      }
    }

    const merged = Array.from(catalogById.values());
    this.savePackages(merged);
    return merged;
  }

  public getSources(): PackageSource[] {
    return this.get<PackageSource[]>(SOURCES_KEY, DEFAULT_SOURCES);
  }

  public saveSources(sources: PackageSource[]): void {
    this.set(SOURCES_KEY, sources);
  }

  public getCollections(): CustomCollection[] {
    return this.get<CustomCollection[]>(COLLECTIONS_KEY, DEFAULT_COLLECTIONS);
  }

  private async persistCollectionToDb(col: CustomCollection): Promise<void> {
    if (!isTauriEnvironment()) return;
    await tryInvokeCommand('db_save_collection', {
      collection: {
        id: col.id,
        name: col.name,
        description: col.description,
        icon_name: col.iconName,
        package_ids: col.packageIds,
        created_at: col.createdAt,
        updated_at: col.updatedAt,
      },
    });
  }

  public saveCollections(collections: CustomCollection[]): void {
    const previous = this.getCollections();
    const nextIds = new Set(collections.map(c => c.id));
    this.set(COLLECTIONS_KEY, collections);

    if (isTauriEnvironment()) {
      for (const col of collections) {
        this.persistCollectionToDb(col).catch(() => {});
      }
      for (const oldCol of previous) {
        if (!nextIds.has(oldCol.id)) {
          tryInvokeCommand('db_delete_collection', { id: oldCol.id }).catch(() => {});
        }
      }
    }
  }

  public getSearchHistory(): string[] {
    return this.get<string[]>(SEARCH_HISTORY_KEY, []);
  }

  public addSearchQuery(query: string): void {
    if (!query.trim()) return;
    const history = this.getSearchHistory().filter(q => q.toLowerCase() !== query.toLowerCase());
    history.unshift(query.trim());
    this.set(SEARCH_HISTORY_KEY, history.slice(0, 10));
  }

  public clearSearchHistory(): void {
    this.set(SEARCH_HISTORY_KEY, []);
  }

  public getHistoryTasks(): InstallationTask[] {
    return this.get<InstallationTask[]>(HISTORY_KEY, []);
  }

  public addHistoryTask(task: InstallationTask): void {
    const history = this.getHistoryTasks();
    const filtered = history.filter(t => t.id !== task.id);
    filtered.unshift(task);
    this.set(HISTORY_KEY, filtered.slice(0, 50));

    if (isTauriEnvironment()) {
      tryInvokeCommand('db_add_history', {
        record: {
          id: task.id,
          package_id: task.packageId,
          package_name: task.packageName,
          action: task.action,
          version: task.targetVersion || task.version,
          status: task.status,
          error_message: task.error || null,
          exit_code: task.exitCode ?? null,
          start_time: task.startTime,
          end_time: task.endTime ?? null,
        },
      }).catch(() => {});
    }
  }

  public clearHistory(): void {
    this.set(HISTORY_KEY, []);
    if (isTauriEnvironment()) {
      tryInvokeCommand('db_clear_history').catch(() => {});
    }
  }

  public exportWinGetManifest(winGetVersion = 'unknown'): string {
    const packages = this.getPackages().filter(p => p.isInstalled && !p.isExternal);
    const manifest: WinGetExportManifest = {
      $schema: 'https://aka.ms/winget-packages.schema.2.0.json',
      CreationDate: new Date().toISOString(),
      WinGetVersion: winGetVersion.replace(/^v/i, ''),
      Sources: [
        {
          Packages: packages.map(p => ({
            PackageIdentifier: p.id,
            Version: p.installedVersion || p.version,
          })),
          SourceDetails: {
            Argument: 'https://cdn.winget.microsoft.com/cache',
            Identifier: 'Microsoft.Winget.Source_8wekyb3d8bbwe',
            Name: 'winget',
            Type: 'Microsoft.PreIndexed.Package',
          },
        },
      ],
    };
    return JSON.stringify(manifest, null, 2);
  }

  public importWinGetManifest(jsonContent: string): { importedCount: number; packageIds: string[] } {
    try {
      const manifest = JSON.parse(jsonContent);
      const packageIds: string[] = [];
      if (manifest.Sources && Array.isArray(manifest.Sources)) {
        for (const src of manifest.Sources) {
          if (src.Packages && Array.isArray(src.Packages)) {
            for (const pkg of src.Packages) {
              if (pkg.PackageIdentifier) {
                packageIds.push(pkg.PackageIdentifier);
              }
            }
          }
        }
      }
      return { importedCount: packageIds.length, packageIds };
    } catch (e) {
      throw new Error(`Invalid WinGet JSON manifest: ${(e as Error).message}`);
    }
  }

  public createFullBackup(): string {
    return JSON.stringify(
      {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        settings: this.getSettings(),
        favorites: this.getFavoriteIds(),
        collections: this.getCollections(),
        sources: this.getSources(),
        history: this.getHistoryTasks(),
      },
      null,
      2
    );
  }

  public restoreFullBackup(backupJson: string): boolean {
    try {
      const data = JSON.parse(backupJson);
      if (data.settings) this.saveSettings(data.settings);
      if (Array.isArray(data.favorites)) {
        this.set(FAVORITES_KEY, data.favorites);
        for (const id of data.favorites) {
          this.setFavorite(id, true);
        }
      }
      if (Array.isArray(data.collections)) this.saveCollections(data.collections);
      if (Array.isArray(data.sources)) this.saveSources(data.sources);
      if (Array.isArray(data.history)) this.set(HISTORY_KEY, data.history);
      return true;
    } catch {
      return false;
    }
  }

  public resetAllToDefaults(): void {
    if (this.isLocalStorageAvailable()) {
      window.localStorage.removeItem(SETTINGS_KEY);
      window.localStorage.removeItem(PACKAGES_KEY);
      window.localStorage.removeItem(COLLECTIONS_KEY);
      window.localStorage.removeItem(HISTORY_KEY);
      window.localStorage.removeItem(SEARCH_HISTORY_KEY);
      window.localStorage.removeItem(SOURCES_KEY);
      window.localStorage.removeItem(FAVORITES_KEY);
    }
    this.memoryFallback.clear();
  }
}

export const storage = new StorageService();
