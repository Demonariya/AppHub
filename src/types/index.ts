export type Architecture = 'x64' | 'x86' | 'arm64' | 'neutral';

export type PackageSourceType = 'winget' | 'msstore' | 'custom' | 'external' | string;

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
  | 'Drivers and Hardware Utilities'
  | 'Uncategorized';

export type MetadataStatus = 'summary' | 'enriched' | 'failed';

export interface Package {
  id: string;
  packageKey?: string;
  name: string;
  publisher?: string;
  author?: string;
  version: string;
  latestVersion: string;
  description?: string;
  longDescription?: string;
  category: CategoryType;
  tags: string[];
  source: PackageSourceType;
  architectures: Architecture[];
  license?: string;
  licenseUrl?: string;
  homepage?: string;
  publisherUrl?: string;
  icon?: string;
  sizeBytes?: number;
  formattedSize?: string;
  downloadSizeBytes?: number;
  formattedDownloadSize?: string;
  installedSizeBytes?: number;
  formattedInstalledSize?: string;
  requiredStorageDisk?: string;
  rating?: number;
  ratingCount?: number;
  releaseDate?: string;
  releaseNotes?: string;
  dependencies?: string[];
  installerType?: 'nullsoft' | 'inno' | 'msi' | 'wix' | 'msix' | 'zip' | 'exe' | 'portable' | string;
  installerUrl?: string;
  verified: boolean;
  sha256?: string;
  metadataStatus?: MetadataStatus;
  isAvailable?: boolean;
  lastObservedAt?: number;
  lastMetadataRefreshAt?: number;
  isInstalled?: boolean;
  installedVersion?: string;
  isExternal?: boolean;
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

export type OperationPhase =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type OperationStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskStatus = OperationPhase;

export interface OperationProgressEvent {
  taskId: string;
  eventSequence: number;
  phase?: OperationPhase;
  status: OperationStatus;
  progressPercent?: number;
  isIndeterminate: boolean;
  bytesDownloaded?: number;
  totalBytes?: number;
  downloadSpeed?: string;
  message?: string;
  stream: 'stdout' | 'stderr' | 'status';
  timestamp: number;
}

export interface TaskLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  stream?: 'stdout' | 'stderr' | 'status';
  message: string;
}

export interface InstallationTask {
  id: string;
  packageId: string;
  packageName: string;
  source?: PackageSourceType;
  action: TaskAction;
  version: string;
  targetVersion?: string;
  status: TaskStatus;
  phase?: OperationPhase;
  operationStatus?: OperationStatus;
  progress: number; // 0 to 100 (meaningful when !isIndeterminate)
  isIndeterminate?: boolean;
  bytesDownloaded?: number;
  totalBytes?: number;
  downloadSpeed?: string;
  lastEventSequence?: number;
  statusMessage?: string;
  error?: string;
  exitCode?: number;
  verifiedInstalledVersion?: string;
  startTime: number;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
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
  sourceType?: string;
  isOfficial: boolean;
  isEnabled?: boolean;
  lastUpdated?: string;
  lastSyncAt?: number;
  lastStatus?: string;
  lastError?: string;
  packageCount?: number;
  isComplete?: boolean;
  trustLevel: 'verified' | 'community' | 'untrusted';
}

export interface SourceSyncOutcome {
  sourceName: string;
  sourceType: string;
  isOfficial: boolean;
  status: 'completed' | 'partial' | 'failed' | 'skipped' | 'agreement_required' | 'cancelled';
  commandExecuted: string;
  exitCode?: number;
  discoveredCount: number;
  insertedCount: number;
  updatedCount: number;
  unchangedCount: number;
  unavailableCount: number;
  isComplete: boolean;
  truncationReason?: string;
  error?: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
}

export interface CatalogSyncResult {
  runId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  totalDiscovered: number;
  newlyDiscovered: number;
  updatedRecords: number;
  unchangedRecords: number;
  unavailableRecords: number;
  succeededSources: string[];
  failedSources: string[];
  sourceOutcomes: SourceSyncOutcome[];
  isComplete: boolean;
  isPartial: boolean;
  cancelled: boolean;
  agreementRequired: boolean;
  error?: string;
}

export interface CatalogSyncProgress {
  runId: string;
  phase:
    | 'discovering-sources'
    | 'syncing-source'
    | 'reconciling'
    | 'completed'
    | 'failed'
    | 'cancelled';
  currentSource?: string;
  sourcesCompleted: number;
  sourcesTotal: number;
  packagesDiscovered: number;
  message: string;
  isIndeterminate: boolean;
}

export interface CatalogSyncRunRecord {
  runId: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: string;
  totalDiscovered: number;
  newlyDiscovered: number;
  updatedRecords: number;
  unchangedRecords: number;
  unavailableRecords: number;
  isComplete: boolean;
  isPartial: boolean;
  cancelled: boolean;
  error?: string;
  outcomes: SourceSyncOutcome[];
}

export interface CatalogCacheStats {
  totalPackages: number;
  availablePackages: number;
  enrichedPackages: number;
  lastSyncAt?: number;
  lastAttemptedSyncAt?: number;
  lastSyncComplete: boolean;
  lastSyncError?: string;
  sourceCounts: Array<[string, number]>;
  categoryCounts: Array<[string, number]>;
  dbSizeBytes: number;
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
  autoSyncCatalog: boolean;
  syncCatalogOnStartup: boolean;
  catalogRefreshIntervalHours: number;
  enabledSyncSources: string[];
  sourceAgreementsAccepted: boolean;
  desktopNotifications: boolean;
  closeToTray: boolean;
  startWithWindows: boolean;
  wingetPath: string;
  activeSource: string;
  maxConcurrentDownloads: number;
  logRetentionDays: number;
  defaultCustomLocation?: string;
  useCustomLocationByDefault?: boolean;
}

export interface WinGetEnvironment {
  isInstalled: boolean;
  version: string;
  appInstallerAvailable: boolean;
  supportsDisableInteractivity?: boolean;
  path: string;
  locale: string;
  windowsVersion: string;
  architecture: Architecture;
  adminPrivileges: boolean;
  error?: string;
}

export interface SearchFilters {
  query: string;
  category: CategoryType | 'All';
  source: PackageSourceType | 'all';
  architecture: Architecture | 'all';
  installationStatus: 'all' | 'installed' | 'available' | 'updates';
  sortBy: 'relevance' | 'name' | 'releaseDate';
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
