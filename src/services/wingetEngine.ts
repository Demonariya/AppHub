import {
  Architecture,
  CatalogCacheStats,
  CatalogSyncProgress,
  CatalogSyncResult,
  CatalogSyncRunRecord,
  InstallationTask,
  OperationPhase,
  OperationProgressEvent,
  OperationStatus,
  Package,
  PackageSource,
  PackageVersionInfo,
  TaskLogEntry,
  WinGetEnvironment,
} from '../types';
import { isTauriEnvironment, invokeCommand, tryInvokeCommand } from './tauriBridge';
import { storage } from './storage';
import {
  formatBytes,
  getPackageKey,
  inferCategoryFromMetadata,
  normalizePackageStorage,
} from './catalog';

export interface WinGetCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  parsedData?: any;
}

export type LogListener = (entry: TaskLogEntry) => void;
export type ProgressListener = (event: OperationProgressEvent) => void;

interface NativeWinGetOutputEvent {
  task_id: string;
  event_sequence?: number;
  stream: string;
  line: string;
  progress: number | null;
  progress_percent?: number | null;
  is_indeterminate: boolean;
  bytes_downloaded?: number | null;
  total_bytes?: number | null;
  download_speed: string | null;
  phase: OperationPhase | null;
  status?: OperationStatus;
  message?: string | null;
  timestamp?: number;
}

interface NativeCatalogSyncProgressEvent {
  run_id: string;
  phase: CatalogSyncProgress['phase'];
  current_source: string | null;
  sources_completed: number;
  sources_total: number;
  packages_discovered: number;
  message: string;
  is_indeterminate: boolean;
}

interface EnrichmentJob {
  key: string;
  pkg: Package;
  force: boolean;
  fetcher?: (pkg: Package) => Promise<Partial<Package> | null>;
  onEnriched?: (pkgKey: string, metadata: Partial<Package>) => void;
  resolve: (result: Partial<Package> | null) => void;
}

const METADATA_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Bounded-concurrency queue for lazy `winget show` metadata enrichment.
 * Prevents spawning dozens of concurrent `winget.exe` processes when browsing paginated cards.
 */
export class MetadataRefreshQueue {
  private readonly maxConcurrency: number;
  private queue: EnrichmentJob[] = [];
  private inFlight = new Map<string, Promise<Partial<Package> | null>>();
  private activeCount = 0;
  private generation = 0;

  constructor(maxConcurrency = 2) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  public enqueue(
    pkg: Package,
    options: {
      force?: boolean;
      fetcher?: (pkg: Package) => Promise<Partial<Package> | null>;
      onEnriched?: (pkgKey: string, metadata: Partial<Package>) => void;
    } = {}
  ): Promise<Partial<Package> | null> {
    if (pkg.isExternal) return Promise.resolve(null);

    const force = Boolean(options.force);
    const now = Date.now();
    if (
      !force &&
      pkg.metadataStatus === 'enriched' &&
      pkg.lastMetadataRefreshAt &&
      now - pkg.lastMetadataRefreshAt < METADATA_TTL_MS
    ) {
      return Promise.resolve(null);
    }

    const key = getPackageKey(pkg.id, pkg.source);
    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const promise = new Promise<Partial<Package> | null>(resolve => {
      this.queue.push({
        key,
        pkg,
        force,
        fetcher: options.fetcher,
        onEnriched: options.onEnriched,
        resolve,
      });
      this.pump();
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  public cancelAll(): void {
    this.generation += 1;
    const pending = this.queue.splice(0, this.queue.length);
    for (const job of pending) {
      this.inFlight.delete(job.key);
      job.resolve(null);
    }
  }

  public getStats(): { queued: number; active: number; inFlight: number } {
    return {
      queued: this.queue.length,
      active: this.activeCount,
      inFlight: this.inFlight.size,
    };
  }

  private pump(): void {
    while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
      const job = this.queue.shift()!;
      const runGen = this.generation;
      this.activeCount += 1;
      void this.runJob(job, runGen);
    }
  }

  private async runJob(job: EnrichmentJob, runGen: number): Promise<void> {
    try {
      if (runGen !== this.generation) {
        job.resolve(null);
        return;
      }
      const fetcher =
        job.fetcher ||
        ((target: Package) => wingetEngine.showPackageDetails(target.id, target.source));
      const details = await fetcher(job.pkg);
      if (runGen !== this.generation || !details) {
        job.resolve(null);
        return;
      }
      if (job.onEnriched) {
        job.onEnriched(job.key, details);
      }
      job.resolve(details);
    } catch {
      job.resolve(null);
    } finally {
      this.inFlight.delete(job.key);
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.pump();
    }
  }
}

class WinGetEngineService {
  private environment: WinGetEnvironment = {
    isInstalled: false,
    version: isTauriEnvironment() ? 'Checking...' : 'Unavailable (Web Preview)',
    appInstallerAvailable: false,
    path: '',
    locale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
    windowsVersion: isTauriEnvironment() ? 'Detecting Windows...' : 'Browser Preview',
    architecture: 'x64',
    adminPrivileges: false,
  };

  private environmentLoaded = false;
  public readonly metadataQueue = new MetadataRefreshQueue(2);

  public async refreshEnvironment(explicitPath?: string): Promise<WinGetEnvironment> {
    if (isTauriEnvironment()) {
      try {
        const customPath = explicitPath ?? storage.getSettings().wingetPath;
        const info = await invokeCommand<any>('check_winget_environment', {
          wingetPath: customPath && customPath.trim() ? customPath.trim() : null,
        });
        this.environment = {
          isInstalled: Boolean(info.is_installed),
          version: info.version || 'Not Detected',
          appInstallerAvailable: Boolean(info.app_installer_available),
          supportsDisableInteractivity: Boolean(info.supports_disable_interactivity),
          path: typeof info.path === 'string' ? info.path : 'winget',
          locale: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
          windowsVersion: info.windows_version || 'Windows',
          architecture: (info.architecture || 'x64') as Architecture,
          adminPrivileges: false,
          error: info.error || undefined,
        };
        this.environmentLoaded = true;
      } catch (err: any) {
        this.environment = {
          ...this.environment,
          isInstalled: false,
          version: 'Not Detected',
          appInstallerAvailable: false,
          error: err?.message || String(err),
        };
      }
    }
    return { ...this.environment };
  }

  public getEnvironment(): WinGetEnvironment {
    if (!this.environmentLoaded && isTauriEnvironment()) {
      this.refreshEnvironment().catch(() => {});
    }
    return { ...this.environment };
  }

  public isValidPackageId(id: string): boolean {
    if (!id || typeof id !== 'string' || id.length > 128) return false;
    const dotted = /^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)+$/;
    if (dotted.test(id)) return true;
    const msstore = /^[A-Z0-9]{10,20}$/;
    return msstore.test(id) && /\d/.test(id);
  }

  public buildInstallArgs(
    packageId: string,
    options: {
      silent?: boolean;
      force?: boolean;
      version?: string;
      architecture?: Architecture;
      customLocation?: string;
      acceptPackageAgreements?: boolean;
      acceptSourceAgreements?: boolean;
    } = {}
  ): string[] {
    const args = ['install', '--id', packageId, '--exact'];
    if (options.version) {
      args.push('--version', options.version);
    }
    if (options.silent) {
      args.push('--silent');
    }
    if (options.force) {
      args.push('--force');
    }
    if (options.acceptPackageAgreements ?? true) {
      args.push('--accept-package-agreements');
    }
    if (options.acceptSourceAgreements ?? true) {
      args.push('--accept-source-agreements');
    }
    if (options.architecture && options.architecture !== 'neutral') {
      args.push('--architecture', options.architecture);
    }
    if (options.customLocation) {
      args.push('--location', options.customLocation);
    }
    return args;
  }

  public buildUninstallArgs(packageId: string, silent = true): string[] {
    const args = ['uninstall', '--id', packageId, '--exact'];
    if (silent) args.push('--silent');
    return args;
  }

  public buildUpgradeArgs(packageId?: string, silent = true, acceptAgreements = true): string[] {
    if (!packageId) {
      const args = ['upgrade', '--all'];
      if (silent) args.push('--silent');
      if (acceptAgreements) args.push('--accept-package-agreements', '--accept-source-agreements');
      return args;
    }
    const args = ['upgrade', '--id', packageId, '--exact'];
    if (silent) args.push('--silent');
    if (acceptAgreements) args.push('--accept-package-agreements', '--accept-source-agreements');
    return args;
  }

  public formatCliPreview(args: string[]): string {
    return `winget ${args
      .map((a, idx) => {
        if (a === '' || a.includes(' ') || (idx > 0 && args[idx - 1] === '--location')) {
          return `"${a}"`;
        }
        return a;
      })
      .join(' ')}`;
  }

  /**
   * Synchronizes the local SQLite WinGet catalog from enabled WinGet sources.
   * Requires the native Tauri desktop runtime; rejects cleanly in browser preview.
   */
  public async syncCatalog(
    options: {
      targetSources?: string[];
      acceptSourceAgreements?: boolean;
      onProgress?: (progress: CatalogSyncProgress) => void;
    } = {}
  ): Promise<CatalogSyncResult> {
    if (!isTauriEnvironment()) {
      throw new Error(
        'WinGet catalog synchronization requires the Windows desktop runtime.'
      );
    }

    const settings = storage.getSettings();
    const wingetPath = settings.wingetPath || null;
    const enabledSources =
      Array.isArray(settings.enabledSyncSources) && settings.enabledSyncSources.length > 0
        ? settings.enabledSyncSources
        : null;
    const acceptAgreements =
      options.acceptSourceAgreements ??
      Boolean(settings.sourceAgreementsAccepted || settings.autoAcceptAgreements);

    let unlisten: (() => void) | null = null;
    if (options.onProgress) {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<NativeCatalogSyncProgressEvent>(
          'catalog-sync-progress',
          ev => {
            const p = ev.payload;
            if (!p) return;
            options.onProgress!({
              runId: p.run_id,
              phase: p.phase,
              currentSource: p.current_source || undefined,
              sourcesCompleted: p.sources_completed,
              sourcesTotal: p.sources_total,
              packagesDiscovered: p.packages_discovered,
              message: p.message,
              isIndeterminate: Boolean(p.is_indeterminate),
            });
          }
        );
      } catch {
        unlisten = null;
      }
    }

    try {
      const raw = await invokeCommand<any>('winget_sync_catalog', {
        targetSources:
          options.targetSources && options.targetSources.length > 0
            ? options.targetSources
            : null,
        enabledSources,
        acceptSourceAgreements: acceptAgreements,
        wingetPath,
      });

      const result: CatalogSyncResult = {
        runId: raw.run_id,
        startedAt: raw.started_at,
        completedAt: raw.completed_at,
        durationMs: raw.duration_ms,
        totalDiscovered: raw.total_discovered ?? 0,
        newlyDiscovered: raw.newly_discovered ?? 0,
        updatedRecords: raw.updated_records ?? 0,
        unchangedRecords: raw.unchanged_records ?? 0,
        unavailableRecords: raw.unavailable_records ?? 0,
        succeededSources: raw.succeeded_sources || [],
        failedSources: raw.failed_sources || [],
        sourceOutcomes: Array.isArray(raw.source_outcomes)
          ? raw.source_outcomes.map((o: any) => ({
              sourceName: o.source_name,
              sourceType: o.source_type,
              isOfficial: Boolean(o.is_official),
              status: o.status,
              commandExecuted: o.command_executed,
              exitCode: o.exit_code ?? undefined,
              discoveredCount: o.discovered_count ?? 0,
              insertedCount: o.inserted_count ?? 0,
              updatedCount: o.updated_count ?? 0,
              unchangedCount: o.unchanged_count ?? 0,
              unavailableCount: o.unavailable_count ?? 0,
              isComplete: Boolean(o.is_complete),
              truncationReason: o.truncation_reason || undefined,
              error: o.error || undefined,
              startedAt: o.started_at,
              completedAt: o.completed_at,
              durationMs: o.duration_ms,
            }))
          : [],
        isComplete: Boolean(raw.is_complete),
        isPartial: Boolean(raw.is_partial),
        cancelled: Boolean(raw.cancelled),
        agreementRequired: Boolean(raw.agreement_required),
        error: raw.error || undefined,
      };

      return result;
    } finally {
      if (unlisten) unlisten();
    }
  }

  public async cancelCatalogSync(): Promise<boolean> {
    this.metadataQueue.cancelAll();
    if (!isTauriEnvironment()) return false;
    return (await tryInvokeCommand<boolean>('cancel_winget_catalog_sync', {}, false)) ?? false;
  }

  public async getCatalogStats(): Promise<CatalogCacheStats> {
    if (!isTauriEnvironment()) {
      return storage.getCatalogCacheStats();
    }
    const raw = await invokeCommand<any>('db_get_catalog_stats');
    return {
      totalPackages: raw.total_packages ?? 0,
      availablePackages: raw.available_packages ?? 0,
      enrichedPackages: raw.enriched_packages ?? 0,
      lastSyncAt: raw.last_sync_at ?? undefined,
      lastAttemptedSyncAt: raw.last_attempted_sync_at ?? undefined,
      lastSyncComplete: Boolean(raw.last_sync_complete),
      lastSyncError: raw.last_sync_error || undefined,
      sourceCounts: Array.isArray(raw.source_counts) ? raw.source_counts : [],
      categoryCounts: Array.isArray(raw.category_counts) ? raw.category_counts : [],
      dbSizeBytes: raw.db_size_bytes ?? 0,
    };
  }

  public async getCatalogSyncHistory(limit = 20): Promise<CatalogSyncRunRecord[]> {
    if (!isTauriEnvironment()) {
      return storage.getCatalogSyncHistory();
    }
    await storage.hydrateCatalogFromDatabase();
    return storage.getCatalogSyncHistory().slice(0, limit);
  }

  /**
   * Executes real `winget search` via native backend.
   * Never fabricates missing publisher/description/category/license fields.
   */
  public async searchPackages(query: string): Promise<Package[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    if (!isTauriEnvironment()) {
      return [];
    }

    const wingetPath = storage.getSettings().wingetPath || null;
    const rawResults = await invokeCommand<any[]>('winget_search', {
      query: trimmed,
      wingetPath,
    });
    const now = Date.now();
    return (rawResults || []).map(r => {
      const tags: string[] = Array.isArray(r.tags) ? r.tags : [];
      const description: string | undefined = r.description || undefined;
      const source: string = r.source || 'winget';
      return normalizePackageStorage({
        id: r.id,
        packageKey: getPackageKey(r.id, source),
        name: r.name || r.id,
        publisher: r.publisher || undefined,
        author: r.author || undefined,
        version: r.version || 'Unknown',
        latestVersion: r.latest_version || r.version || 'Unknown',
        description,
        category: (r.category || inferCategoryFromMetadata(tags, description)) as any,
        tags,
        source,
        architectures: Array.isArray(r.architectures) ? r.architectures : [],
        license: r.license || undefined,
        homepage: r.homepage || undefined,
        releaseDate: r.release_date || undefined,
        verified: Boolean(r.verified ?? (source === 'winget' || source === 'msstore')),
        metadataStatus: r.metadata_status || 'summary',
        isAvailable: true,
        lastObservedAt: now,
        isInstalled: Boolean(r.is_installed),
        installedVersion: r.installed_version || undefined,
      });
    });
  }

  /**
   * Executes real `winget list` via native backend.
   */
  public async listInstalledPackages(query?: string): Promise<Array<{
    id: string;
    name: string;
    version: string;
    availableVersion?: string;
    source?: string;
    isWingetManaged: boolean;
    installedSizeBytes?: number;
  }>> {
    if (!isTauriEnvironment()) return [];

    const wingetPath = storage.getSettings().wingetPath || null;
    const raw = await invokeCommand<any[]>('winget_list', {
      query: query || null,
      wingetPath,
    });
    return (raw || []).map(r => ({
      id: r.id,
      name: r.name,
      version: r.version,
      availableVersion: r.available_version || undefined,
      source: r.source || undefined,
      isWingetManaged: Boolean(r.is_winget_managed),
      installedSizeBytes:
        typeof r.installed_size_bytes === 'number' && r.installed_size_bytes > 0
          ? r.installed_size_bytes
          : undefined,
    }));
  }

  /**
   * Executes real `winget upgrade` via native backend.
   */
  public async listAvailableUpgrades(): Promise<Array<{
    id: string;
    name: string;
    installedVersion: string;
    availableVersion: string;
    source: string;
  }>> {
    if (!isTauriEnvironment()) return [];

    const wingetPath = storage.getSettings().wingetPath || null;
    const raw = await invokeCommand<any[]>('winget_upgrade_list', { wingetPath });
    return (raw || []).map(r => ({
      id: r.id,
      name: r.name,
      installedVersion: r.installed_version,
      availableVersion: r.available_version,
      source: r.source,
    }));
  }

  /**
   * Executes real `winget show --id <id> --exact [--source <source>]` via native backend.
   */
  public async showPackageDetails(
    packageId: string,
    source?: string
  ): Promise<Partial<Package> | null> {
    if (!this.isValidPackageId(packageId)) return null;
    if (!isTauriEnvironment()) return null;

    const wingetPath = storage.getSettings().wingetPath || null;
    const details = await invokeCommand<any>('winget_show', {
      packageId,
      source: source || null,
      wingetPath,
    });
    if (!details) return null;

    const downloadSizeBytes =
      typeof details.download_size_bytes === 'number' && details.download_size_bytes > 0
        ? details.download_size_bytes
        : undefined;
    const tags: string[] = Array.isArray(details.tags) ? details.tags : [];
    const description: string | undefined = details.description || undefined;
    const inferredCategory = inferCategoryFromMetadata(tags, description);

    return {
      name: details.name,
      publisher: details.publisher || undefined,
      author: details.author || undefined,
      version: details.version,
      latestVersion: details.version,
      description,
      longDescription: description,
      category: inferredCategory,
      homepage: details.homepage || undefined,
      publisherUrl: details.publisher_url || undefined,
      license: details.license || undefined,
      licenseUrl: details.license_url || undefined,
      releaseDate: details.release_date || undefined,
      releaseNotes: details.release_notes || undefined,
      installerType: details.installer_type || undefined,
      installerUrl: details.installer_url || undefined,
      sha256: details.installer_sha256 || undefined,
      architectures: Array.isArray(details.architectures) ? details.architectures : [],
      downloadSizeBytes,
      sizeBytes: downloadSizeBytes,
      formattedDownloadSize: downloadSizeBytes ? formatBytes(downloadSizeBytes) : undefined,
      formattedSize: downloadSizeBytes ? formatBytes(downloadSizeBytes) : undefined,
      tags,
      metadataStatus: 'enriched',
      lastMetadataRefreshAt: Date.now(),
    };
  }

  /**
   * Probes the remote installer URL via a lightweight HTTP HEAD request in Tauri to resolve Content-Length.
   */
  public async probeInstallerSize(installerUrl?: string): Promise<number | undefined> {
    if (!isTauriEnvironment() || !installerUrl) return undefined;
    const trimmed = installerUrl.trim();
    if (!trimmed.startsWith('https://') && !trimmed.startsWith('http://')) return undefined;
    const bytes = await tryInvokeCommand<number | null>('probe_installer_size', { url: trimmed }, null);
    return typeof bytes === 'number' && bytes > 0 ? bytes : undefined;
  }

  public async verifyPackageInstallationState(
    packageId: string
  ): Promise<{ installed: boolean; version?: string } | null> {
    if (!isTauriEnvironment() || !this.isValidPackageId(packageId)) {
      return null;
    }
    try {
      const matches = await this.listInstalledPackages(packageId);
      const exact = matches.find(
        m => m.id.trim().toLowerCase() === packageId.trim().toLowerCase()
      );
      if (exact) {
        return { installed: true, version: exact.version };
      }
      return { installed: false };
    } catch {
      return null;
    }
  }

  public async cancelTask(taskId: string): Promise<boolean> {
    if (!isTauriEnvironment()) return false;
    return (await tryInvokeCommand<boolean>('cancel_winget_operation', { taskId }, false)) ?? false;
  }

  public async executeTask(
    task: InstallationTask,
    pkg: Package,
    onProgress: ProgressListener,
    onLog: LogListener,
    isCancelled: () => boolean
  ): Promise<{ success: boolean; error?: string; exitCode?: number; cancelled?: boolean }> {
    const timestamp = () => new Date().toLocaleTimeString();
    let localSeq = Math.max(0, task.lastEventSequence ?? 0);
    const nextSeq = (remoteSeq?: number) => {
      if (typeof remoteSeq === 'number' && remoteSeq > localSeq) {
        localSeq = remoteSeq;
      } else {
        localSeq += 1;
      }
      return localSeq;
    };

    const addLog = (
      level: TaskLogEntry['level'],
      message: string,
      stream: TaskLogEntry['stream'] = 'status'
    ) => {
      const entry: TaskLogEntry = { timestamp: timestamp(), level, stream, message };
      task.logs.push(entry);
      onLog(entry);
    };

    const args =
      task.action === 'uninstall'
        ? this.buildUninstallArgs(task.packageId, task.flags.silent)
        : task.action === 'update'
        ? this.buildUpgradeArgs(task.packageId, task.flags.silent, task.flags.acceptPackageAgreements)
        : this.buildInstallArgs(task.packageId, {
            silent: task.flags.silent,
            force: task.flags.force,
            version: task.targetVersion && task.targetVersion !== pkg.latestVersion ? task.targetVersion : undefined,
            architecture: task.flags.architecture,
            customLocation: task.flags.customLocation,
            acceptPackageAgreements: task.flags.acceptPackageAgreements,
            acceptSourceAgreements: task.flags.acceptSourceAgreements,
          });

    addLog('info', `> ${this.formatCliPreview(args)}`, 'status');

    if (!this.isValidPackageId(task.packageId)) {
      addLog('error', `Invalid package identifier '${task.packageId}'`, 'status');
      return { success: false, error: 'Invalid package identifier', exitCode: 1 };
    }

    if (isCancelled()) {
      addLog('warn', `Operation cancelled before execution.`, 'status');
      return { success: false, error: 'Cancelled by user', cancelled: true, exitCode: -1 };
    }

    if (isTauriEnvironment()) {
      let unlisten: (() => void) | null = null;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<NativeWinGetOutputEvent>('winget-output', event => {
          const payload = event.payload;
          if (!payload || payload.task_id !== task.id) return;

          const stream: 'stdout' | 'stderr' | 'status' =
            payload.stream === 'stderr'
              ? 'stderr'
              : payload.stream === 'status'
              ? 'status'
              : 'stdout';

          if (payload.line) {
            const lower = payload.line.toLowerCase();
            const level: TaskLogEntry['level'] =
              stream === 'stderr' || lower.includes('error') || lower.includes('failed')
                ? 'error'
                : lower.includes('successfully')
                ? 'success'
                : 'info';
            addLog(level, payload.line, stream);
          }

          const percent =
            typeof payload.progress_percent === 'number'
              ? payload.progress_percent
              : typeof payload.progress === 'number'
              ? payload.progress
              : undefined;

          onProgress({
            taskId: task.id,
            eventSequence: nextSeq(payload.event_sequence),
            phase: payload.phase || undefined,
            status: payload.status || 'running',
            progressPercent: percent,
            isIndeterminate: Boolean(payload.is_indeterminate),
            bytesDownloaded:
              typeof payload.bytes_downloaded === 'number' ? payload.bytes_downloaded : undefined,
            totalBytes:
              typeof payload.total_bytes === 'number' ? payload.total_bytes : undefined,
            downloadSpeed: payload.download_speed || undefined,
            message: payload.message || payload.line || undefined,
            stream,
            timestamp: payload.timestamp ?? Date.now(),
          });
        });

        onProgress({
          taskId: task.id,
          eventSequence: nextSeq(),
          phase: 'preparing',
          status: 'running',
          isIndeterminate: true,
          message: 'Starting WinGet process...',
          stream: 'status',
          timestamp: Date.now(),
        });
        addLog('info', `Starting WinGet process...`, 'status');

        const wingetPath = storage.getSettings().wingetPath || null;
        let result: {
          exit_code: number;
          stdout: string;
          stderr: string;
          success: boolean;
          cancelled: boolean;
        };

        if (task.action === 'uninstall') {
          result = await invokeCommand('winget_uninstall', {
            packageId: task.packageId,
            silent: task.flags.silent,
            taskId: task.id,
            wingetPath,
          });
        } else if (task.action === 'update') {
          result = await invokeCommand('winget_upgrade', {
            packageId: task.packageId,
            silent: task.flags.silent,
            acceptAgreements: task.flags.acceptPackageAgreements,
            taskId: task.id,
            wingetPath,
          });
        } else {
          result = await invokeCommand('winget_install', {
            packageId: task.packageId,
            silent: task.flags.silent,
            force: task.flags.force,
            version: task.targetVersion || null,
            customLocation: task.flags.customLocation || null,
            architecture: task.flags.architecture || null,
            acceptAgreements: task.flags.acceptPackageAgreements,
            taskId: task.id,
            wingetPath,
          });
        }

        if (result.cancelled) {
          addLog('warn', `WinGet operation cancelled.`, 'status');
          return {
            success: false,
            error: 'Cancelled by user',
            exitCode: result.exit_code,
            cancelled: true,
          };
        }

        if (result.success && result.exit_code === 0) {
          addLog('success', `WinGet exited with code 0 (${pkg.id})`, 'status');
          return { success: true, exitCode: 0 };
        } else {
          const errCodeHex = `0x${(result.exit_code >>> 0).toString(16).toUpperCase()}`;
          addLog('error', `WinGet exited with code ${result.exit_code} (${errCodeHex})`, 'stderr');
          return {
            success: false,
            error: result.stderr?.trim() || `WinGet exited with code ${result.exit_code} (${errCodeHex})`,
            exitCode: result.exit_code,
          };
        }
      } catch (nativeErr: any) {
        const msg = nativeErr?.message || String(nativeErr);
        addLog('error', `Execution error: ${msg}`, 'stderr');
        return { success: false, error: msg, exitCode: -1 };
      } finally {
        if (unlisten) unlisten();
      }
    }

    // Outside Tauri (browser preview / Node test environment): fail honestly without pretending WinGet ran
    addLog(
      'error',
      `Native WinGet CLI cannot run inside a browser preview. Launch the AppHub Windows desktop app to execute '${this.formatCliPreview(args)}'.`,
      'stderr'
    );
    return {
      success: false,
      error: 'WinGet CLI requires the Windows desktop runtime.',
      exitCode: 1,
    };
  }

  public async pinPackage(packageId: string, pin: boolean, version?: string): Promise<boolean> {
    if (!isTauriEnvironment()) return false;
    const wingetPath = storage.getSettings().wingetPath || null;
    if (pin) {
      const res = await invokeCommand<any>('winget_pin_add', {
        packageId,
        version: version || null,
        wingetPath,
      });
      return Boolean(res?.success);
    } else {
      const res = await invokeCommand<any>('winget_pin_remove', {
        packageId,
        wingetPath,
      });
      return Boolean(res?.success);
    }
  }

  // --- Real Source Management ---

  public async getSources(): Promise<
    Array<{ name: string; argument: string; sourceType: string; isOfficial: boolean }>
  > {
    if (isTauriEnvironment()) {
      const wingetPath = storage.getSettings().wingetPath || null;
      const raw = await invokeCommand<any[]>('winget_source_list', { wingetPath });
      return (raw || []).map(s => ({
        name: s.name,
        argument: s.argument,
        sourceType: s.source_type || 'Unspecified',
        isOfficial: Boolean(s.is_official),
      }));
    }
    return [];
  }

  public async addSource(name: string, url: string): Promise<boolean> {
    if (!isTauriEnvironment()) {
      throw new Error('Managing WinGet sources requires the Windows desktop runtime.');
    }
    const wingetPath = storage.getSettings().wingetPath || null;
    const res = await invokeCommand<any>('winget_source_add', { name, url, wingetPath });
    if (!res?.success) {
      throw new Error(res?.stderr || res?.stdout || `winget source add exited with code ${res?.exit_code}`);
    }
    return true;
  }

  public async removeSource(name: string): Promise<boolean> {
    if (!isTauriEnvironment()) {
      throw new Error('Managing WinGet sources requires the Windows desktop runtime.');
    }
    const wingetPath = storage.getSettings().wingetPath || null;
    const res = await invokeCommand<any>('winget_source_remove', { name, wingetPath });
    if (!res?.success) {
      throw new Error(res?.stderr || res?.stdout || `winget source remove exited with code ${res?.exit_code}`);
    }
    return true;
  }

  public async updateSources(): Promise<boolean> {
    if (!isTauriEnvironment()) {
      throw new Error('Updating WinGet sources requires the Windows desktop runtime.');
    }
    const wingetPath = storage.getSettings().wingetPath || null;
    const res = await invokeCommand<any>('winget_source_update', { wingetPath });
    if (!res?.success) {
      throw new Error(res?.stderr || res?.stdout || `winget source update exited with code ${res?.exit_code}`);
    }
    return true;
  }

  public async resetSources(): Promise<boolean> {
    if (!isTauriEnvironment()) {
      throw new Error('Resetting WinGet sources requires the Windows desktop runtime.');
    }
    const wingetPath = storage.getSettings().wingetPath || null;
    const res = await invokeCommand<any>('winget_source_reset', { wingetPath });
    if (!res?.success) {
      throw new Error(res?.stderr || res?.stdout || `winget source reset exited with code ${res?.exit_code}`);
    }
    return true;
  }

  public async fetchPackageVersions(pkg: Package): Promise<PackageVersionInfo[]> {
    if (isTauriEnvironment() && this.isValidPackageId(pkg.id) && !pkg.isExternal) {
      try {
        const wingetPath = storage.getSettings().wingetPath || null;
        const versions = await invokeCommand<string[]>('winget_show_versions', {
          packageId: pkg.id,
          wingetPath,
        });
        if (versions && versions.length > 0) {
          return versions.map((ver, idx) => ({
            version: ver,
            releaseDate: idx === 0 && pkg.releaseDate ? pkg.releaseDate : 'Indexed in WinGet',
            changelog:
              ver === pkg.installedVersion
                ? 'Currently installed version on this system.'
                : idx === 0
                ? `Latest published version (${ver}).`
                : `Available version ${ver} in WinGet manifest index.`,
            type: 'patch',
            isLatest: idx === 0,
            isCurrent: pkg.installedVersion === ver,
            downloadSize: pkg.formattedDownloadSize || pkg.formattedSize,
          }));
        }
      } catch (err) {
        console.warn(`[WinGet Versions] Could not load --versions for ${pkg.id}:`, err);
      }
    }

    const latest = pkg.latestVersion || pkg.version;
    const installed = pkg.installedVersion;
    const result: PackageVersionInfo[] = [
      {
        version: latest,
        releaseDate: pkg.releaseDate || 'Not reported',
        changelog: `Published version in WinGet catalog (${latest}).`,
        type: 'patch',
        isLatest: true,
        isCurrent: installed === latest,
        downloadSize: pkg.formattedDownloadSize || pkg.formattedSize,
      },
    ];

    if (installed && installed !== latest) {
      result.push({
        version: installed,
        releaseDate: pkg.installedDate || 'Installed locally',
        changelog: 'Currently installed version on local system.',
        type: 'patch',
        isCurrent: true,
        downloadSize: pkg.formattedDownloadSize || pkg.formattedSize,
      });
    }

    return result;
  }

  public async sendNotification(title: string, body: string): Promise<void> {
    const settings = storage.getSettings();
    if (!settings.desktopNotifications) return;

    if (isTauriEnvironment()) {
      await tryInvokeCommand('send_desktop_notification', { title, body });
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  }
}

export const wingetEngine = new WinGetEngineService();
