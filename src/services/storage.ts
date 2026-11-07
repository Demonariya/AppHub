import { AppSettings, CustomCollection, InstallationTask, Package, PackageSource, WinGetExportManifest } from '../types';
import { INITIAL_PACKAGES, normalizePackageStorage } from './catalog';

const SETTINGS_KEY = 'apphub_settings_v1';
const PACKAGES_KEY = 'apphub_packages_v1';
const COLLECTIONS_KEY = 'apphub_collections_v1';
const HISTORY_KEY = 'apphub_history_v1';
const SEARCH_HISTORY_KEY = 'apphub_search_history_v1';
const SOURCES_KEY = 'apphub_sources_v1';

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
  wingetPath: 'C:\\Users\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe',
  activeSource: 'winget',
  telemetryDisabled: true,
  maxConcurrentDownloads: 1, // Sequential installation by default per user requirement
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
    enabled: true,
    isOfficial: true,
    lastUpdated: '2024-11-28 08:30:12',
    packageCount: 6842,
    trustLevel: 'verified',
  },
  {
    id: 'msstore',
    name: 'msstore',
    arg: 'https://storeedgefd.dsx.mp.microsoft.com/v9.0',
    type: 'msstore',
    enabled: true,
    isOfficial: true,
    lastUpdated: '2024-11-28 07:15:00',
    packageCount: 12400,
    trustLevel: 'verified',
  },
  {
    id: 'community-repo',
    name: 'Community Curated Repo',
    arg: 'https://packages.apphub.internal/feed',
    type: 'custom',
    enabled: false,
    isOfficial: false,
    lastUpdated: '2024-11-25 14:00:22',
    packageCount: 184,
    trustLevel: 'community',
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
      'Nodejs.Nodejs',
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

  public getSettings(): AppSettings {
    return { ...DEFAULT_SETTINGS, ...this.get<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS) };
  }

  public saveSettings(settings: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    this.set(SETTINGS_KEY, updated);
    return updated;
  }

  public getPackages(): Package[] {
    const saved = this.get<Package[] | null>(PACKAGES_KEY, null);
    if (!saved || saved.length === 0) {
      this.set(PACKAGES_KEY, INITIAL_PACKAGES);
      return INITIAL_PACKAGES;
    }
    return saved.map(normalizePackageStorage);
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

  public getSources(): PackageSource[] {
    return this.get<PackageSource[]>(SOURCES_KEY, DEFAULT_SOURCES);
  }

  public saveSources(sources: PackageSource[]): void {
    this.set(SOURCES_KEY, sources);
  }

  public getCollections(): CustomCollection[] {
    return this.get<CustomCollection[]>(COLLECTIONS_KEY, DEFAULT_COLLECTIONS);
  }

  public saveCollections(collections: CustomCollection[]): void {
    this.set(COLLECTIONS_KEY, collections);
  }

  public getSearchHistory(): string[] {
    return this.get<string[]>(SEARCH_HISTORY_KEY, ['terminal', 'vscode', 'git', 'browser', 'powertoys']);
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
  }

  public clearHistory(): void {
    this.set(HISTORY_KEY, []);
  }

  public exportWinGetManifest(): string {
    const packages = this.getPackages().filter(p => p.isInstalled);
    const manifest: WinGetExportManifest = {
      $schema: 'https://aka.ms/winget-packages.schema.2.0.json',
      CreationDate: new Date().toISOString(),
      WinGetVersion: '1.9.25200',
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
    return JSON.stringify({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      settings: this.getSettings(),
      packages: this.getPackages(),
      collections: this.getCollections(),
      sources: this.getSources(),
      history: this.getHistoryTasks(),
    }, null, 2);
  }

  public restoreFullBackup(backupJson: string): boolean {
    try {
      const data = JSON.parse(backupJson);
      if (data.settings) this.set(SETTINGS_KEY, data.settings);
      if (data.packages) this.set(PACKAGES_KEY, data.packages);
      if (data.collections) this.set(COLLECTIONS_KEY, data.collections);
      if (data.sources) this.set(SOURCES_KEY, data.sources);
      if (data.history) this.set(HISTORY_KEY, data.history);
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
    }
    this.memoryFallback.clear();
  }
}

export const storage = new StorageService();
