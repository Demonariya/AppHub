export type Architecture = 'x64' | 'x86' | 'arm64' | 'neutral';

export type PackageSourceType = 'winget' | 'msstore' | 'custom';

export type CategoryType =
  | 'Browsers'
  | 'Development'
  | 'Gaming'
  | 'Multimedia'
  | 'Communication'
  | 'Security'
  | 'Productivity'
  | 'Utilities'
  | 'System Tools'
  | 'Compression'
  | 'Drivers and Hardware Utilities';

export interface Package {
  id: string;
  name: string;
  publisher: string;
  version: string;
  latestVersion: string;
  description: string;
  longDescription?: string;
  category: CategoryType;
  tags: string[];
  source: PackageSourceType;
  architectures: Architecture[];
  license: string;
  homepage: string;
  publisherUrl?: string;
  icon?: string;
  sizeBytes?: number;
  formattedSize?: string;
  downloadSizeBytes?: number;
  formattedDownloadSize?: string;
  installedSizeBytes?: number;
  formattedInstalledSize?: string;
  requiredStorageDisk?: string;
  rating: number;
  ratingCount: number;
  releaseDate: string;
  dependencies?: string[];
  installerType?: 'nullsoft' | 'inno' | 'msi' | 'wix' | 'msix' | 'zip' | 'exe' | 'portable';
  verified: boolean;
  sha256?: string;
  isInstalled?: boolean;
  installedVersion?: string;
  isPinned?: boolean;
  pinnedVersion?: string;
  isExcludedFromUpdates?: boolean;
  installedDate?: string;
  isFavorite?: boolean;
  versionHistory?: PackageVersionInfo[];
}

export interface PackageVersionInfo {
  version: string;
  releaseDate: string;
  changelog: string;
  type: 'major' | 'minor' | 'patch';
  isCurrent?: boolean;
  isLatest?: boolean;
  breakingChanges?: boolean;
  downloadSize?: string;
  sha256?: string;
  installerType?: string;
}

export type TaskAction = 'install' | 'update' | 'uninstall' | 'reinstall';

export type TaskStatus =
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface TaskLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface InstallationTask {
  id: string;
  packageId: string;
  packageName: string;
  action: TaskAction;
  version: string;
  targetVersion?: string;
  status: TaskStatus;
  progress: number; // 0 to 100
  downloadSpeed?: string;
  error?: string;
  startTime: number;
  endTime?: number;
  logs: TaskLogEntry[];
  flags: {
    silent: boolean;
    force: boolean;
    acceptPackageAgreements: boolean;
    acceptSourceAgreements: boolean;
    customLocation?: string;
    architecture?: Architecture;
  };
}

export interface PackageSource {
  id: string;
  name: string;
  arg: string;
  type: PackageSourceType;
  enabled: boolean;
  isOfficial: boolean;
  lastUpdated: string;
  packageCount: number;
  trustLevel: 'verified' | 'community' | 'untrusted';
}

export interface CustomCollection {
  id: string;
  name: string;
  description: string;
  iconName: string;
  packageIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  density: 'comfortable' | 'compact';
  silentInstall: boolean;
  requireConfirmation: boolean;
  autoAcceptAgreements: boolean;
  preferredArchitecture: Architecture;
  checkUpdatesOnStartup: boolean;
  desktopNotifications: boolean;
  closeToTray: boolean;
  startWithWindows: boolean;
  wingetPath: string;
  activeSource: string;
  telemetryDisabled: boolean;
  maxConcurrentDownloads: number;
  logRetentionDays: number;
  defaultCustomLocation?: string;
  useCustomLocationByDefault?: boolean;
}

export interface WinGetEnvironment {
  isInstalled: boolean;
  version: string;
  appInstallerAvailable: boolean;
  path: string;
  locale: string;
  windowsVersion: string;
  architecture: Architecture;
  adminPrivileges: boolean;
}

export interface SearchFilters {
  query: string;
  category: CategoryType | 'All';
  source: PackageSourceType | 'all';
  architecture: Architecture | 'all';
  installationStatus: 'all' | 'installed' | 'available' | 'updates';
  sortBy: 'relevance' | 'name' | 'rating' | 'releaseDate';
  sortOrder: 'asc' | 'desc';
}

export interface WinGetExportManifest {
  $schema: string;
  CreationDate: string;
  WinGetVersion: string;
  Sources: {
    Packages: {
      PackageIdentifier: string;
      Version?: string;
      Channel?: string;
    }[];
    SourceDetails: {
      Argument: string;
      Identifier: string;
      Name: string;
      Type: string;
    };
  }[];
}
