import {
  AppSettings,
  CatalogCacheStats,
  CatalogSyncRunRecord,
  CategoryType,
  CustomCollection,
  InstallationTask,
  OperationPhase,
  OperationStatus,
  Package,
  PackageSource,
  WinGetExportManifest,
} from '../types';
import {
  getPackageKey,
  inferCategoryFromMetadata,
  normalizePackageStorage,
} from './catalog';
import { isTauriEnvironment, tryInvokeCommand } from './tauriBridge';

const SETTINGS_KEY = 'apphub_settings_v1';
const PACKAGES_KEY = 'apphub_packages_v2';
const LEGACY_MIGRATED_KEY = 'apphub_catalog_migrated_v3';
const COLLECTIONS_KEY = 'apphub_collections_v1';
const HISTORY_KEY = 'apphub_history_v1';
const SEARCH_HISTORY_KEY = 'apphub_search_history_v1';
const RECENT_VIEWS_KEY = 'apphub_recent_views_v1';
const SOURCES_KEY = 'apphub_sources_v2';
const FAVORITES_KEY = 'apphub_favorites_v1';
const CATALOG_STATS_KEY = 'apphub_catalog_stats_v1';
const SYNC_HISTORY_KEY = 'apphub_catalog_sync_history_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  density: 'comfortable',
  silentInstall: true,
  requireConfirmation: true,
  autoAcceptAgreements: true,
  preferredArchitecture: 'x64',
  checkUpdatesOnStartup: true,
  autoSyncCatalog: true,
  syncCatalogOnStartup: true,
  catalogRefreshIntervalHours: 24,
  enabledSyncSources: [],
  sourceAgreementsAccepted: false,
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

export const DEFAULT_SOURCES: PackageSource[] = [];
export const DEFAULT_COLLECTIONS: CustomCollection[] = [];

export const EMPTY_CATALOG_STATS: CatalogCacheStats = {
  totalPackages: 0,
  availablePackages: 0,
  enrichedPackages: 0,
  lastSyncAt: undefined,
  lastAttemptedSyncAt: undefined,
  lastSyncComplete: false,
  lastSyncError: undefined,
  sourceCounts: [],
  categoryCounts: [],
  dbSizeBytes: 0,
};

function mapNativePackageToFrontend(raw: any, favSet: Set<string>): Package {
  const tags: string[] = Array.isArray(raw.tags) ? raw.tags : [];
  const description: string | undefined = raw.description || undefined;
  const category = (raw.category ||
    inferCategoryFromMetadata(tags, description)) as CategoryType;
  const source: string = raw.source || 'winget';
  const id: string = raw.id;

  return normalizePackageStorage({
    id,
    packageKey: getPackageKey(id, source),
    name: raw.name || id,
    publisher: raw.publisher || undefined,
    author: raw.author || undefined,
    version: raw.version || 'Unknown',
    latestVersion: raw.latest_version || raw.version || 'Unknown',
    description,
    longDescription: description,
    category,
    tags,
    source,
    architectures: Array.isArray(raw.architectures) ? raw.architectures : [],
    license: raw.license || undefined,
    licenseUrl: raw.license_url || undefined,
    homepage: raw.homepage || undefined,
    publisherUrl: raw.publisher_url || undefined,
    releaseDate: raw.release_date || undefined,
    releaseNotes: raw.release_notes || undefined,
    installerType: raw.installer_type || undefined,
    installerUrl: raw.installer_url || undefined,
    sha256: raw.installer_sha256 || undefined,
    downloadSizeBytes:
      typeof raw.download_size_bytes === 'number' && raw.download_size_bytes > 0
        ? raw.download_size_bytes
        : undefined,
    installedSizeBytes:
      typeof raw.installed_size_bytes === 'number' && raw.installed_size_bytes > 0
        ? raw.installed_size_bytes
        : undefined,
    verified: Boolean(raw.verified),
    metadataStatus: raw.metadata_status || 'summary',
    isAvailable: raw.is_available !== false,
    lastObservedAt:
      typeof raw.last_observed_at === 'number' ? raw.last_observed_at : undefined,
    lastMetadataRefreshAt:
      typeof raw.last_metadata_refresh_at === 'number'
        ? raw.last_metadata_refresh_at
        : undefined,
    isInstalled: Boolean(raw.is_installed),
    installedVersion: raw.installed_version || undefined,
    isPinned: Boolean(raw.is_pinned),
    isFavorite: favSet.has(id.toLowerCase()),
  });
}

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

  private remove(key: string): void {
    if (this.isLocalStorageAvailable()) {
      window.localStorage.removeItem(key);
    }
    this.memoryFallback.delete(key);
  }

  /**
   * Safely cleans up any un-installed static catalog entries from pre-sync versions
   * while preserving user favorites, collections, settings, and installation history.
   */
  private migrateLegacyStaticCatalogIfNeeded(): void {
    const migrated = this.get<boolean>(LEGACY_MIGRATED_KEY, false);
    if (migrated) return;

    const existing = this.get<Package[] | null>(PACKAGES_KEY, null);
    if (Array.isArray(existing) && existing.length > 0) {
      const retained = existing.filter(
        p =>
          Boolean(p.lastObservedAt) ||
          Boolean(p.isInstalled) ||
          p.source === 'external'
      );
      this.set(PACKAGES_KEY, retained);
    }
    this.set(LEGACY_MIGRATED_KEY, true);
  }

  /**
   * Hydrates settings, favorites, collections, operation history, and cached SQLite WinGet catalog on startup.
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
      }
      const favLowerSet = new Set((dbFavs || this.getFavoriteIds()).map(id => id.toLowerCase()));

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
        for (const col of this.getCollections()) {
          await this.persistCollectionToDb(col);
        }
      }

      const dbHistory = await tryInvokeCommand<any[]>('db_get_history', { limit: 100 });
      if (dbHistory) {
        const existingLocal = this.getHistoryTasks();
        const localById = new Map(existingLocal.map(t => [t.id, t]));
        const toOpStatus = (status: string): OperationStatus => {
          if (status === 'queued') return 'queued';
          if (status === 'completed') return 'completed';
          if (status === 'cancelled') return 'cancelled';
          if (status === 'failed') return 'failed';
          return 'running';
        };
        const merged: InstallationTask[] = dbHistory.map(r => {
          const local = localById.get(r.id);
          const status = (r.status || 'completed') as OperationPhase;
          const queuedAt = r.queued_at ?? local?.queuedAt ?? r.start_time;
          const startedAt = r.started_at ?? local?.startedAt;
          const endedAt = r.ended_at ?? r.end_time ?? local?.endedAt;
          return {
            id: r.id,
            packageId: r.package_id,
            packageName: r.package_name,
            source: local?.source,
            action: (r.action || 'install') as InstallationTask['action'],
            version: r.version,
            targetVersion: local?.targetVersion || r.version,
            status,
            phase: status,
            operationStatus: toOpStatus(status),
            progress: status === 'completed' ? 100 : local?.progress ?? 0,
            isIndeterminate: false,
            error: r.error_message || undefined,
            exitCode: r.exit_code ?? local?.exitCode,
            verifiedInstalledVersion: local?.verifiedInstalledVersion,
            queuedAt,
            startedAt: startedAt ?? undefined,
            endedAt: endedAt ?? undefined,
            startTime: r.start_time ?? queuedAt,
            endTime: r.end_time ?? endedAt ?? undefined,
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

      await this.hydrateCatalogFromDatabase(favLowerSet);
    } catch (err) {
      console.warn('[Storage] SQLite hydration warning:', err);
    }
  }

  /**
   * Reloads synchronized catalog packages, source statuses, stats, and sync history from native SQLite.
   */
  public async hydrateCatalogFromDatabase(favLowerSetOverride?: Set<string>): Promise<Package[]> {
    if (!isTauriEnvironment()) return this.getPackages();

    const favSet =
      favLowerSetOverride ||
      new Set(this.getFavoriteIds().map(id => id.toLowerCase()));

    const [rawCatalog, rawStats, rawSources, rawRuns] = await Promise.all([
      tryInvokeCommand<any[]>('db_get_catalog_packages', { includeUnavailable: false }),
      tryInvokeCommand<any>('db_get_catalog_stats'),
      tryInvokeCommand<any[]>('db_get_catalog_sources_status'),
      tryInvokeCommand<any[]>('db_get_catalog_sync_history', { limit: 20 }),
    ]);

    if (Array.isArray(rawCatalog)) {
      const existingLocal = this.getPackages();
      const installedByKey = new Map<string, Package>();
      const externalPackages: Package[] = [];
      for (const p of existingLocal) {
        if (p.isExternal) {
          externalPackages.push(p);
        } else if (p.isInstalled) {
          installedByKey.set(getPackageKey(p.id, p.source), p);
        }
      }

      const byKey = new Map<string, Package>();
      for (const row of rawCatalog) {
        const mapped = mapNativePackageToFrontend(row, favSet);
        const key = getPackageKey(mapped.id, mapped.source);
        const prevInstalled = installedByKey.get(key);
        byKey.set(
          key,
          prevInstalled
            ? normalizePackageStorage({
                ...mapped,
                isInstalled: true,
                installedVersion: prevInstalled.installedVersion,
                installedDate: prevInstalled.installedDate,
                installedSizeBytes:
                  prevInstalled.installedSizeBytes ?? mapped.installedSizeBytes,
                isPinned: prevInstalled.isPinned,
                pinnedVersion: prevInstalled.pinnedVersion,
                isExcludedFromUpdates: prevInstalled.isExcludedFromUpdates,
              })
            : mapped
        );
      }

      for (const ext of externalPackages) {
        const key = getPackageKey(ext.id, ext.source);
        if (!byKey.has(key)) {
          byKey.set(key, ext);
        }
      }

      const combined = Array.from(byKey.values());
      this.savePackages(combined);
    }

    if (rawStats) {
      const stats: CatalogCacheStats = {
        totalPackages: rawStats.total_packages ?? 0,
        availablePackages: rawStats.available_packages ?? 0,
        enrichedPackages: rawStats.enriched_packages ?? 0,
        lastSyncAt: rawStats.last_sync_at ?? undefined,
        lastAttemptedSyncAt: rawStats.last_attempted_sync_at ?? undefined,
        lastSyncComplete: Boolean(rawStats.last_sync_complete),
        lastSyncError: rawStats.last_sync_error || undefined,
        sourceCounts: Array.isArray(rawStats.source_counts) ? rawStats.source_counts : [],
        categoryCounts: Array.isArray(rawStats.category_counts) ? rawStats.category_counts : [],
        dbSizeBytes: rawStats.db_size_bytes ?? 0,
      };
      this.set(CATALOG_STATS_KEY, stats);
    }

    if (Array.isArray(rawSources) && rawSources.length > 0) {
      const mappedSources: PackageSource[] = rawSources.map(s => ({
        id: String(s.name).toLowerCase(),
        name: s.name,
        arg: s.argument,
        type: s.name === 'msstore' ? 'msstore' : s.name === 'winget' ? 'winget' : 'custom',
        sourceType: s.source_type,
        isOfficial: Boolean(s.is_official),
        isEnabled: s.is_enabled !== false,
        lastSyncAt: s.last_sync_at ?? undefined,
        lastUpdated: s.last_sync_at
          ? new Date(s.last_sync_at).toLocaleString()
          : undefined,
        lastStatus: s.last_status,
        lastError: s.last_error || undefined,
        packageCount: s.package_count ?? 0,
        isComplete: Boolean(s.is_complete),
        trustLevel: s.is_official ? 'verified' : 'community',
      }));
      this.saveSources(mappedSources);
    }

    if (Array.isArray(rawRuns)) {
      const mappedRuns: CatalogSyncRunRecord[] = rawRuns.map(r => ({
        runId: r.run_id,
        startedAt: r.started_at,
        completedAt: r.completed_at ?? undefined,
        durationMs: r.duration_ms ?? undefined,
        status: r.status,
        totalDiscovered: r.total_discovered ?? 0,
        newlyDiscovered: r.newly_discovered ?? 0,
        updatedRecords: r.updated_records ?? 0,
        unchangedRecords: r.unchanged_records ?? 0,
        unavailableRecords: r.unavailable_records ?? 0,
        isComplete: Boolean(r.is_complete),
        isPartial: Boolean(r.is_partial),
        cancelled: Boolean(r.cancelled),
        error: r.error || undefined,
        outcomes: Array.isArray(r.outcomes)
          ? r.outcomes.map((o: any) => ({
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
      }));
      this.set(SYNC_HISTORY_KEY, mappedRuns);
    }

    return this.getPackages();
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
    const favs = this.getFavoriteIds();
    const lowerTarget = packageId.toLowerCase();
    const nextFavs = favs.filter(id => id.toLowerCase() !== lowerTarget);
    if (isFavorite) {
      nextFavs.unshift(packageId);
    }
    this.set(FAVORITES_KEY, nextFavs);

    if (isTauriEnvironment()) {
      tryInvokeCommand('db_set_favorite', {
        packageId,
        isFav: isFavorite,
      }).catch(() => {});
    }

    const updated = this.getPackages().map(p =>
      p.id.toLowerCase() === lowerTarget ? { ...p, isFavorite } : p
    );
    this.savePackages(updated);
    return updated;
  }

  public getPackages(): Package[] {
    this.migrateLegacyStaticCatalogIfNeeded();
    const saved = this.get<Package[] | null>(PACKAGES_KEY, null);
    if (!saved || saved.length === 0) {
      return [];
    }
    const favSet = new Set(this.getFavoriteIds().map(id => id.toLowerCase()));
    return saved
      .filter(p => p.isAvailable !== false)
      .map(p => ({
        ...normalizePackageStorage(p),
        isFavorite: p.isFavorite || favSet.has(p.id.toLowerCase()),
      }));
  }

  public savePackages(packages: Package[]): void {
    this.set(LEGACY_MIGRATED_KEY, true);
    this.set(PACKAGES_KEY, packages);
  }

  public updatePackage(
    id: string,
    updates: Partial<Package>,
    source?: string
  ): Package | null {
    const list = this.getPackages();
    const targetLower = id.toLowerCase();
    const idx = source
      ? list.findIndex(
          p =>
            p.id.toLowerCase() === targetLower &&
            (p.source || '').toLowerCase() === source.toLowerCase()
        )
      : list.findIndex(p => p.id.toLowerCase() === targetLower);
    if (idx === -1) return null;

    const merged = normalizePackageStorage({
      ...list[idx],
      ...updates,
    });
    list[idx] = merged;
    this.savePackages(list);
    return merged;
  }

  /**
   * Reconciles a source scan against the stored catalog using composite `(id, source)` keys.
   * - Preserves enriched metadata for unchanged/updated summary entries.
   * - Only removes/marks unavailable packages from `sourceName` when `isCompleteScan === true`.
   * - Never alters favorites or custom collections.
   */
  public reconcileCatalogSourceSnapshot(
    sourceName: string,
    records: Package[],
    isCompleteScan: boolean,
    observedAt = Date.now()
  ): {
    packages: Package[];
    inserted: number;
    updated: number;
    unchanged: number;
    markedUnavailable: number;
  } {
    const existing = this.getPackages();
    const favSet = new Set(this.getFavoriteIds().map(id => id.toLowerCase()));
    const srcLower = sourceName.toLowerCase();

    const byKey = new Map<string, Package>();
    for (const p of existing) {
      byKey.set(getPackageKey(p.id, p.source), p);
    }

    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let markedUnavailable = 0;
    const seenKeys = new Set<string>();

    for (const rec of records) {
      const normalizedSource = rec.source || sourceName;
      const key = getPackageKey(rec.id, normalizedSource);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      const prev = byKey.get(key);
      if (prev) {
        const versionOrNameChanged =
          prev.name !== rec.name ||
          prev.version !== rec.version ||
          prev.latestVersion !== rec.latestVersion;

        const merged = normalizePackageStorage({
          ...prev,
          name: rec.name || prev.name,
          version: rec.version || prev.version,
          latestVersion: rec.latestVersion || prev.latestVersion,
          publisher: rec.publisher || prev.publisher,
          description: rec.description || prev.description,
          category:
            prev.metadataStatus === 'enriched' && prev.category !== 'Uncategorized'
              ? prev.category
              : rec.category || prev.category,
          tags: rec.tags.length > 0 ? rec.tags : prev.tags,
          architectures:
            rec.architectures.length > 0 ? rec.architectures : prev.architectures,
          license: rec.license || prev.license,
          homepage: rec.homepage || prev.homepage,
          verified: rec.verified,
          isAvailable: true,
          lastObservedAt: observedAt,
          isFavorite: prev.isFavorite || favSet.has(rec.id.toLowerCase()),
        });
        byKey.set(key, merged);
        if (versionOrNameChanged) updated += 1;
        else unchanged += 1;
      } else {
        byKey.set(
          key,
          normalizePackageStorage({
            ...rec,
            source: normalizedSource,
            packageKey: key,
            isAvailable: true,
            lastObservedAt: observedAt,
            isFavorite: favSet.has(rec.id.toLowerCase()),
          })
        );
        inserted += 1;
      }
    }

    if (isCompleteScan) {
      for (const [key, p] of byKey.entries()) {
        if ((p.source || '').toLowerCase() === srcLower && !seenKeys.has(key)) {
          if (p.isInstalled) {
            byKey.set(key, { ...p, isAvailable: false });
          } else {
            byKey.delete(key);
          }
          markedUnavailable += 1;
        }
      }
    }

    const packages = Array.from(byKey.values());
    this.savePackages(packages);
    return { packages, inserted, updated, unchanged, markedUnavailable };
  }

  public getCatalogCacheStats(): CatalogCacheStats {
    const saved = this.get<CatalogCacheStats | null>(CATALOG_STATS_KEY, null);
    if (saved) return saved;
    const pkgs = this.getPackages();
    const sourceMap = new Map<string, number>();
    const catMap = new Map<string, number>();
    let enriched = 0;
    for (const p of pkgs) {
      if (p.metadataStatus === 'enriched') enriched += 1;
      sourceMap.set(p.source, (sourceMap.get(p.source) || 0) + 1);
      catMap.set(p.category, (catMap.get(p.category) || 0) + 1);
    }
    return {
      ...EMPTY_CATALOG_STATS,
      totalPackages: pkgs.length,
      availablePackages: pkgs.length,
      enrichedPackages: enriched,
      sourceCounts: Array.from(sourceMap.entries()),
      categoryCounts: Array.from(catMap.entries()),
    };
  }

  public saveCatalogCacheStats(stats: CatalogCacheStats): void {
    this.set(CATALOG_STATS_KEY, stats);
  }

  public getCatalogSyncHistory(): CatalogSyncRunRecord[] {
    return this.get<CatalogSyncRunRecord[]>(SYNC_HISTORY_KEY, []);
  }

  public saveCatalogSyncHistory(runs: CatalogSyncRunRecord[]): void {
    this.set(SYNC_HISTORY_KEY, runs);
  }

  /**
   * Clears ONLY cached catalog package records and sync metadata.
   * Never clears user favorites, collections, settings, or history.
   */
  public async clearCatalogCache(): Promise<Package[]> {
    this.remove(PACKAGES_KEY);
    this.remove(CATALOG_STATS_KEY);
    this.remove(SYNC_HISTORY_KEY);
    this.set(LEGACY_MIGRATED_KEY, true);

    if (isTauriEnvironment()) {
      await tryInvokeCommand('db_clear_catalog_cache');
    }
    return [];
  }

  public clearPackageCache(): Package[] {
    this.remove(PACKAGES_KEY);
    this.remove(CATALOG_STATS_KEY);
    this.set(LEGACY_MIGRATED_KEY, true);
    if (isTauriEnvironment()) {
      void tryInvokeCommand('db_clear_catalog_cache');
    }
    return [];
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
      installedSizeBytes?: number;
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
    const favSet = new Set(this.getFavoriteIds().map(id => id.toLowerCase()));
    const catalogByKey = new Map<string, Package>();
    const firstKeyById = new Map<string, string>();

    for (const p of existing) {
      const key = getPackageKey(p.id, p.source);
      catalogByKey.set(key, {
        ...p,
        isInstalled: false,
        installedVersion: undefined,
        isExternal: p.source === 'external',
      });
      if (!firstKeyById.has(p.id.toLowerCase())) {
        firstKeyById.set(p.id.toLowerCase(), key);
      }
    }

    const upgradeByKey = new Map<string, (typeof upgrades)[0]>();
    const upgradeById = new Map<string, (typeof upgrades)[0]>();
    for (const u of upgrades) {
      upgradeByKey.set(getPackageKey(u.id, u.source), u);
      if (!upgradeById.has(u.id.toLowerCase())) {
        upgradeById.set(u.id.toLowerCase(), u);
      }
    }

    for (const app of installedApps) {
      const isExternal = app.isWingetManaged === false || !app.source;
      const appSource = isExternal ? 'external' : app.source || 'winget';
      const exactKey = getPackageKey(app.id, appSource);
      const upg = upgradeByKey.get(exactKey) || upgradeById.get(app.id.toLowerCase());
      const latestVer = upg?.availableVersion || app.availableVersion || app.version;
      const liveInstalledSize =
        typeof app.installedSizeBytes === 'number' && app.installedSizeBytes > 0
          ? app.installedSizeBytes
          : undefined;

      const matchKey = catalogByKey.has(exactKey)
        ? exactKey
        : !isExternal
        ? firstKeyById.get(app.id.toLowerCase())
        : undefined;
      const match = matchKey ? catalogByKey.get(matchKey) : undefined;

      if (match && matchKey) {
        catalogByKey.set(
          matchKey,
          normalizePackageStorage({
            ...match,
            isInstalled: true,
            installedVersion: app.version,
            latestVersion: latestVer || match.latestVersion,
            isExternal,
            isFavorite: match.isFavorite || favSet.has(match.id.toLowerCase()),
            installedSizeBytes: liveInstalledSize ?? match.installedSizeBytes,
          })
        );
      } else {
        catalogByKey.set(
          exactKey,
          normalizePackageStorage({
            id: app.id,
            packageKey: exactKey,
            name: app.name,
            publisher: isExternal ? 'Local Windows Application' : undefined,
            version: latestVer,
            latestVersion: latestVer,
            description: isExternal
              ? `Detected locally on Windows (${app.id}). Managed outside WinGet.`
              : undefined,
            category: 'Uncategorized',
            tags: [],
            source: appSource,
            architectures: [],
            license: undefined,
            homepage: undefined,
            releaseDate: undefined,
            verified: appSource === 'winget' || appSource === 'msstore',
            metadataStatus: 'summary',
            isAvailable: true,
            lastObservedAt: Date.now(),
            isInstalled: true,
            installedVersion: app.version,
            isExternal,
            isFavorite: favSet.has(app.id.toLowerCase()),
            installedSizeBytes: liveInstalledSize,
          })
        );
        if (!firstKeyById.has(app.id.toLowerCase())) {
          firstKeyById.set(app.id.toLowerCase(), exactKey);
        }
      }
    }

    const merged = Array.from(catalogByKey.values());
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

  public getRecentlyViewedIds(): string[] {
    return this.get<string[]>(RECENT_VIEWS_KEY, []);
  }

  public recordRecentlyViewed(packageId: string): string[] {
    const current = this.getRecentlyViewedIds().filter(
      id => id.toLowerCase() !== packageId.toLowerCase()
    );
    const next = [packageId, ...current].slice(0, 12);
    this.set(RECENT_VIEWS_KEY, next);
    return next;
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
          end_time: task.endTime ?? task.endedAt ?? null,
          queued_at: task.queuedAt ?? task.startTime,
          started_at: task.startedAt ?? null,
          ended_at: task.endedAt ?? task.endTime ?? null,
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
    this.remove(SETTINGS_KEY);
    this.remove(PACKAGES_KEY);
    this.remove(COLLECTIONS_KEY);
    this.remove(HISTORY_KEY);
    this.remove(SEARCH_HISTORY_KEY);
    this.remove(RECENT_VIEWS_KEY);
    this.remove(SOURCES_KEY);
    this.remove(FAVORITES_KEY);
    this.remove(CATALOG_STATS_KEY);
    this.remove(SYNC_HISTORY_KEY);
    this.set(LEGACY_MIGRATED_KEY, true);
  }
}

export const storage = new StorageService();
