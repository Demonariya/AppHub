import { MetadataRefreshQueue, wingetEngine } from '../services/wingetEngine';
import { DEFAULT_COLLECTIONS, DEFAULT_SOURCES, storage } from '../services/storage';
import { installationQueue } from '../services/installationQueue';
import {
  formatBytes,
  getPackageKey,
  inferCategoryFromMetadata,
  isCatalogCacheStale,
  normalizePackageStorage,
} from '../services/catalog';
import { InstallationTask, Package } from '../types';
import { getAppIconUrl } from '../services/iconService';
import { TEST_FIXTURE_PACKAGES } from './fixtures';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export async function runAllAutomatedTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const runTest = async (suite: string, name: string, fn: () => Promise<void> | void) => {
    const start = performance.now();
    try {
      await fn();
      results.push({
        suite,
        name,
        passed: true,
        durationMs: Math.round(performance.now() - start),
      });
    } catch (e) {
      results.push({
        suite,
        name,
        passed: false,
        durationMs: Math.round(performance.now() - start),
        error: (e as Error).message,
      });
    }
  };

  // Suite 1: WinGet Detection & Environment (Honest Non-Tauri State)
  await runTest('WinGet Environment', 'Reports honest environment status without fake CLI version', () => {
    const env = wingetEngine.getEnvironment();
    if (!env.architecture || !env.locale) {
      throw new Error('Environment object missing architecture or locale metadata');
    }
    if (env.isInstalled && !env.version.startsWith('v')) {
      throw new Error(`Installed WinGet must expose version string, got ${env.version}`);
    }
    if (!env.isInstalled && env.version === 'v1.9.25200') {
      throw new Error('Detected forbidden fabricated fallback WinGet version v1.9.25200');
    }
  });

  // Suite 2: Command Argument Validation & Security
  await runTest('Security & Validation', 'Validates legitimate dotted and Microsoft Store package IDs', () => {
    const valid = [
      'Microsoft.VisualStudioCode',
      'Git.Git',
      'Mozilla.Firefox',
      'Valve.Steam',
      '7zip.7zip',
      'Notepad++.Notepad++',
      'OpenJS.NodeJS.LTS',
      '9WZDNCRFJ3TJ',
      'XP89DCGQ3K6VLD',
    ];
    for (const id of valid) {
      if (!wingetEngine.isValidPackageId(id)) {
        throw new Error(`Valid ID rejected: ${id}`);
      }
    }
  });

  await runTest('Security & Validation', 'Rejects shell injection attacks and malformed IDs', () => {
    const malicious = [
      '',
      'singleword',
      'ABCDEFGHIJKL',
      'Microsoft.VSCode; rm -rf /',
      'pkg$(calc.exe)',
      'id with spaces.app',
      '../escape/path',
    ];
    for (const id of malicious) {
      if (wingetEngine.isValidPackageId(id)) {
        throw new Error(`Malicious or invalid ID improperly accepted: ${id}`);
      }
    }
  });

  // Suite 3: Safe Argument Vectors
  await runTest('WinGet CLI Engine', 'Builds safe argument arrays for install', () => {
    const args = wingetEngine.buildInstallArgs('Mozilla.Firefox', {
      silent: true,
      architecture: 'x64',
    });
    if (!args.includes('install') || !args.includes('--silent') || !args.includes('Mozilla.Firefox')) {
      throw new Error(`Missing expected CLI arguments: ${args.join(' ')}`);
    }
  });

  await runTest('WinGet CLI Engine', 'Builds safe argument arrays for upgrade', () => {
    const args = wingetEngine.buildUpgradeArgs('Microsoft.VisualStudioCode', true);
    if (!args.includes('upgrade') || !args.includes('--exact')) {
      throw new Error(`Upgrade arguments invalid: ${args.join(' ')}`);
    }
  });

  // Suite 4: Dynamic Catalog Synchronization & Zero Static Production Catalog
  await runTest('Catalog Sync', 'Starts empty without hardcoded static production catalog or fake defaults', () => {
    storage.resetAllToDefaults();
    const pkgs = storage.getPackages();
    if (pkgs.length !== 0) {
      throw new Error(`Expected empty clean catalog without static fallback, found ${pkgs.length} items`);
    }
    if (DEFAULT_SOURCES.length !== 0) {
      throw new Error(`Expected empty DEFAULT_SOURCES (discovered dynamically), found ${DEFAULT_SOURCES.length}`);
    }
    if (DEFAULT_COLLECTIONS.length !== 0) {
      throw new Error(`Expected empty DEFAULT_COLLECTIONS, found ${DEFAULT_COLLECTIONS.length}`);
    }
  });

  await runTest('Catalog Sync', 'Preserves favorites, collections, settings, and history when clearing catalog cache', async () => {
    storage.resetAllToDefaults();
    storage.saveSettings({ theme: 'light', catalogRefreshIntervalHours: 12 });
    storage.setFavorite('Git.Git', true);
    storage.saveCollections([
      {
        id: 'col_user',
        name: 'My Dev Kit',
        description: 'Custom stack',
        iconName: 'Layers',
        packageIds: ['Git.Git'],
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      },
    ]);
    storage.reconcileCatalogSourceSnapshot('winget', TEST_FIXTURE_PACKAGES, true);

    const beforeClear = storage.getPackages();
    if (beforeClear.length !== TEST_FIXTURE_PACKAGES.length) {
      throw new Error(`Expected ${TEST_FIXTURE_PACKAGES.length} synced items before clear`);
    }

    await storage.clearCatalogCache();
    const afterClear = storage.getPackages();
    if (afterClear.length !== 0) {
      throw new Error('Expected catalog packages to be cleared');
    }
    if (!storage.getFavoriteIds().includes('Git.Git')) {
      throw new Error('Favorites were lost when clearing catalog cache');
    }
    if (storage.getCollections().length !== 1 || storage.getSettings().catalogRefreshIntervalHours !== 12) {
      throw new Error('Collections or settings were lost when clearing catalog cache');
    }
    storage.resetAllToDefaults();
  });

  await runTest('Catalog Sync', 'Reconciles multi-source records with composite (id, source) keys and partial scan safety', () => {
    storage.resetAllToDefaults();

    const wingetPkg: Package = normalizePackageStorage({
      id: 'Mozilla.Firefox',
      name: 'Firefox',
      version: '134.0',
      latestVersion: '134.0',
      category: 'Browsers',
      tags: ['browser'],
      source: 'winget',
      architectures: ['x64'],
      verified: true,
      publisher: 'Mozilla',
      description: 'Enriched description',
      metadataStatus: 'enriched',
    });

    const msstorePkg: Package = normalizePackageStorage({
      id: 'Mozilla.Firefox',
      name: 'Firefox (Store)',
      version: '134.0',
      latestVersion: '134.0',
      category: 'Uncategorized',
      tags: [],
      source: 'msstore',
      architectures: [],
      verified: true,
      metadataStatus: 'summary',
    });

    const extraWingetPkg: Package = normalizePackageStorage({
      id: 'Git.Git',
      name: 'Git',
      version: '2.47.1',
      latestVersion: '2.47.1',
      category: 'Uncategorized',
      tags: [],
      source: 'winget',
      architectures: [],
      verified: true,
      metadataStatus: 'summary',
    });

    storage.reconcileCatalogSourceSnapshot('winget', [wingetPkg, extraWingetPkg], true, 1000);
    storage.reconcileCatalogSourceSnapshot('msstore', [msstorePkg], true, 1000);

    const all = storage.getPackages();
    if (all.length !== 3) {
      throw new Error(`Expected 3 composite-keyed records across winget + msstore, found ${all.length}`);
    }

    // Partial scan of winget with only Firefox summary must preserve Git.Git AND preserve Firefox enriched fields
    const summaryFirefox: Package = normalizePackageStorage({
      id: 'Mozilla.Firefox',
      name: 'Firefox',
      version: '135.0',
      latestVersion: '135.0',
      category: 'Uncategorized',
      tags: [],
      source: 'winget',
      architectures: [],
      verified: true,
      metadataStatus: 'summary',
    });

    const partialRes = storage.reconcileCatalogSourceSnapshot('winget', [summaryFirefox], false, 2000);
    const updatedFirefox = partialRes.packages.find(
      p => p.id === 'Mozilla.Firefox' && p.source === 'winget'
    );
    if (!updatedFirefox || updatedFirefox.latestVersion !== '135.0' || updatedFirefox.description !== 'Enriched description') {
      throw new Error('Partial summary scan failed to update version or clobbered enriched metadata');
    }
    if (!partialRes.packages.some(p => p.id === 'Git.Git' && p.source === 'winget')) {
      throw new Error('Partial scan improperly removed unseen winget package Git.Git');
    }

    // Complete scan without Git.Git removes unseen winget package while leaving msstore untouched
    const completeRes = storage.reconcileCatalogSourceSnapshot('winget', [summaryFirefox], true, 3000);
    if (completeRes.packages.some(p => p.id === 'Git.Git')) {
      throw new Error('Complete scan failed to prune missing non-installed winget package');
    }
    if (!completeRes.packages.some(p => p.id === 'Mozilla.Firefox' && p.source === 'msstore')) {
      throw new Error('Complete scan of winget improperly altered msstore package');
    }
    storage.resetAllToDefaults();
  });

  await runTest('Catalog Sync', 'Does not fabricate categories, publishers, or descriptions when absent', () => {
    if (inferCategoryFromMetadata([], undefined) !== 'Uncategorized') {
      throw new Error('Empty metadata must infer Uncategorized');
    }
    if (inferCategoryFromMetadata(['git', 'compiler'], '') !== 'Development') {
      throw new Error('Explicit developer tags failed to classify as Development');
    }
    const bare = normalizePackageStorage({
      id: 'Vendor.Tool',
      name: 'Vendor Tool',
      version: '1.0',
      latestVersion: '1.0',
      category: 'Uncategorized',
      tags: [],
      source: 'winget',
      architectures: [],
      verified: true,
    });
    if (bare.publisher !== undefined || bare.description !== undefined) {
      throw new Error('normalizePackageStorage fabricated publisher or description');
    }
  });

  await runTest('Catalog Sync', 'Computes cache staleness accurately across refresh intervals', () => {
    const now = 1_700_000_000_000;
    if (!isCatalogCacheStale(undefined, 24, now)) {
      throw new Error('Missing lastSyncAt must be treated as stale');
    }
    if (isCatalogCacheStale(now - 6 * 60 * 60 * 1000, 24, now)) {
      throw new Error('6h old cache must be fresh for 24h interval');
    }
    if (!isCatalogCacheStale(now - 25 * 60 * 60 * 1000, 24, now)) {
      throw new Error('25h old cache must be stale for 24h interval');
    }
  });

  await runTest('Catalog Sync', 'MetadataRefreshQueue deduplicates in-flight requests and enforces bounded concurrency', async () => {
    const queue = new MetadataRefreshQueue(2);
    let maxConcurrent = 0;
    let activeNow = 0;
    let totalCalls = 0;

    const fetcher = async (pkg: Package): Promise<Partial<Package>> => {
      totalCalls += 1;
      activeNow += 1;
      maxConcurrent = Math.max(maxConcurrent, activeNow);
      await new Promise(r => setTimeout(r, 20));
      activeNow -= 1;
      return { publisher: `Pub-${pkg.id}`, metadataStatus: 'enriched', lastMetadataRefreshAt: Date.now() };
    };

    const p1 = TEST_FIXTURE_PACKAGES[0];
    const p2 = TEST_FIXTURE_PACKAGES[1];
    const p3 = TEST_FIXTURE_PACKAGES[2];

    const [r1a, r1b, r2, r3] = await Promise.all([
      queue.enqueue(p1, { force: true, fetcher }),
      queue.enqueue(p1, { force: true, fetcher }),
      queue.enqueue(p2, { force: true, fetcher }),
      queue.enqueue(p3, { force: true, fetcher }),
    ]);

    if (totalCalls !== 3) {
      throw new Error(`Expected duplicate enqueue for ${p1.id} to coalesce into 3 total fetches, got ${totalCalls}`);
    }
    if (maxConcurrent > 2) {
      throw new Error(`Exceeded bounded concurrency limit 2: saw ${maxConcurrent}`);
    }
    if (r1a?.publisher !== r1b?.publisher || !r2?.publisher || !r3?.publisher) {
      throw new Error('Enrichment queue results incomplete');
    }
  });

  await runTest('Catalog Sync', 'Filters and paginates 5,000 synced packages within sub-50ms budget', () => {
    const bulk: Package[] = Array.from({ length: 5000 }, (_, i) => ({
      id: `Vendor.App${i}`,
      packageKey: getPackageKey(`Vendor.App${i}`, i % 3 === 0 ? 'msstore' : 'winget'),
      name: `Benchmark App ${i}`,
      version: '1.0.0',
      latestVersion: '1.0.0',
      category: i % 2 === 0 ? 'Development' : 'Uncategorized',
      tags: [],
      source: i % 3 === 0 ? 'msstore' : 'winget',
      architectures: [],
      verified: true,
    }));

    const start = performance.now();
    const filtered = bulk
      .filter(p => p.source === 'winget' && p.name.toLowerCase().includes('app 49'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
    const elapsed = performance.now() - start;

    if (filtered.length === 0 || elapsed > 50) {
      throw new Error(`Large catalog filtering slow or empty (${elapsed.toFixed(1)}ms, count=${filtered.length})`);
    }
  });

  // Suite 5: Persistence, Settings, System Reconciliation & Manifest Export/Import
  await runTest('Storage & Persistence', 'Persists favorites, settings, and external WinGet reconciliation', () => {
    storage.resetAllToDefaults();
    storage.reconcileCatalogSourceSnapshot('winget', TEST_FIXTURE_PACKAGES, true);

    const updatedSettings = storage.saveSettings({
      maxConcurrentDownloads: 3,
      density: 'compact',
      theme: 'system',
      wingetPath: 'C:\\Tools\\winget.exe',
    });
    if (
      updatedSettings.maxConcurrentDownloads !== 3 ||
      updatedSettings.density !== 'compact' ||
      updatedSettings.theme !== 'system' ||
      updatedSettings.wingetPath !== 'C:\\Tools\\winget.exe'
    ) {
      throw new Error('Settings persistence failed for newly wired fields');
    }

    const withFav = storage.setFavorite('Git.Git', true);
    if (!withFav.find(p => p.id === 'Git.Git')?.isFavorite || !storage.getFavoriteIds().includes('Git.Git')) {
      throw new Error('Favorite persistence failed');
    }

    const merged = storage.mergeRealSystemState(
      [
        {
          id: 'Git.Git',
          name: 'Git',
          version: '2.46.0',
          source: 'winget',
          isWingetManaged: true,
        },
        {
          id: 'ARP\\Machine\\X64\\CustomVendorApp',
          name: 'Custom Vendor App',
          version: '1.0.0',
          isWingetManaged: false,
        },
      ],
      [
        {
          id: 'Git.Git',
          name: 'Git',
          installedVersion: '2.46.0',
          availableVersion: '2.47.1',
          source: 'winget',
        },
      ]
    );

    const git = merged.find(p => p.id === 'Git.Git');
    const external = merged.find(p => p.id === 'ARP\\Machine\\X64\\CustomVendorApp');
    if (!git?.isInstalled || git.installedVersion !== '2.46.0' || git.latestVersion !== '2.47.1') {
      throw new Error('WinGet reconciliation failed to preserve installed/upgrade version pair');
    }
    if (!external?.isInstalled || !external.isExternal || external.source !== 'external') {
      throw new Error('External Windows application classification failed during reconciliation');
    }
    storage.resetAllToDefaults();
  });

  await runTest('Storage & Persistence', 'Generates valid WinGet JSON Export Manifest excluding external apps', () => {
    storage.mergeRealSystemState(
      [
        { id: 'Git.Git', name: 'Git', version: '2.47.1', source: 'winget', isWingetManaged: true },
        { id: 'ARP\\Machine\\LocalOnly', name: 'LocalOnly', version: '1.0', isWingetManaged: false },
      ],
      []
    );
    const manifestJson = storage.exportWinGetManifest('1.9.25200');
    const parsed = JSON.parse(manifestJson);
    if (!parsed.$schema || !parsed.Sources || !Array.isArray(parsed.Sources)) {
      throw new Error('Exported manifest violates Microsoft WinGet schema structure');
    }
    const exportedIds = parsed.Sources[0].Packages.map((p: any) => p.PackageIdentifier);
    if (!exportedIds.includes('Git.Git') || exportedIds.includes('ARP\\Machine\\LocalOnly')) {
      throw new Error(`Export manifest improperly filtered packages: ${JSON.stringify(exportedIds)}`);
    }
    storage.resetAllToDefaults();
  });

  await runTest('Storage & Persistence', 'Imports WinGet JSON Manifest successfully', () => {
    const testManifest = JSON.stringify({
      $schema: 'https://aka.ms/winget-packages.schema.2.0.json',
      CreationDate: '2024-11-20T00:00:00Z',
      WinGetVersion: '1.9.25200',
      Sources: [
        {
          Packages: [
            { PackageIdentifier: 'Git.Git' },
            { PackageIdentifier: 'Mozilla.Firefox' },
          ],
        },
      ],
    });
    const res = storage.importWinGetManifest(testManifest);
    if (res.importedCount !== 2 || !res.packageIds.includes('Git.Git')) {
      throw new Error(`Import failed, parsed: ${JSON.stringify(res)}`);
    }
  });

  // Suite 6: Installation Queue & Honest Non-Tauri Failure
  await runTest('Installation Queue', 'Prevents duplicate operations and fails honestly outside desktop runtime', async () => {
    const sample = TEST_FIXTURE_PACKAGES.find(p => p.id === '7zip.7zip') || TEST_FIXTURE_PACKAGES[0];
    const task1 = installationQueue.enqueue(sample, 'install', { silent: true, targetVersion: '24.08' });
    const task2 = installationQueue.enqueue(sample, 'install', { silent: true });

    if (task1.id !== task2.id) {
      throw new Error('Expected duplicate enqueue for same package to return existing task');
    }
    if (task1.targetVersion !== '24.08') {
      throw new Error(`Expected targetVersion 24.08 on task, got ${task1.targetVersion}`);
    }

    await new Promise(resolve => setTimeout(resolve, 30));
    const history = storage.getHistoryTasks();
    const recorded = history.find(t => t.id === task1.id);
    if (!recorded || recorded.status !== 'failed') {
      throw new Error(`Expected honest failure in non-Tauri environment, got status=${recorded?.status}`);
    }
    storage.resetAllToDefaults();
  });

  // Suite 7: Version Timeline & Rollback
  await runTest('Version Timeline & Rollback', 'Returns catalog latest + installed version honestly and builds rollback args', async () => {
    const sample: Package = {
      ...TEST_FIXTURE_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!,
      isInstalled: true,
      installedVersion: '1.94.2',
    };
    const versions = await wingetEngine.fetchPackageVersions(sample);
    if (!versions || versions.length < 2) {
      throw new Error(`Expected latest + installed versions, found: ${versions?.length}`);
    }
    if (!versions.some(v => v.isLatest) || !versions.some(v => v.isCurrent && v.version === '1.94.2')) {
      throw new Error('Missing expected latest or current installed version entry');
    }

    const rollbackArgs = wingetEngine.buildInstallArgs('Microsoft.VisualStudioCode', {
      version: '1.94.2',
      force: true,
      silent: true,
    });
    if (!rollbackArgs.includes('--force') || !rollbackArgs.includes('1.94.2')) {
      throw new Error(`Invalid rollback arguments: ${rollbackArgs.join(' ')}`);
    }
  });

  // Suite 8: Real App Icons & Hierarchy
  await runTest('Real App Icons', 'Resolves authentic CDN and official vector assets', async () => {
    const { resolveAppIconAsync, invalidateIconCache } = await import('../services/icons');
    invalidateIconCache();
    const sample = TEST_FIXTURE_PACKAGES.find(p => p.id === 'Mozilla.Firefox')!;
    const iconUrl = getAppIconUrl(sample);
    if (!iconUrl || (!iconUrl.startsWith('http') && !iconUrl.startsWith('data:image/'))) {
      throw new Error(`Invalid fetched icon URL: ${iconUrl}`);
    }

    const verifiedUrls: string[] = [];
    const verifiedFirefox = await resolveAppIconAsync(sample, {
      validator: async url => {
        verifiedUrls.push(url);
        return { valid: true, width: 128, height: 128, mimeType: 'image/png' };
      },
    });
    if (!verifiedFirefox.verified || verifiedUrls.length === 0 || !verifiedUrls[0].startsWith('https://')) {
      throw new Error(`Expected Firefox async verification against https CDN URL, got ${JSON.stringify(verifiedUrls)}`);
    }

    for (const pkg of TEST_FIXTURE_PACKAGES) {
      const u = getAppIconUrl(pkg);
      if (u.includes('raw.githubusercontent.com/microsoft/winget-pkgs')) {
        throw new Error(`Detected dead winget-pkgs icon URL on ${pkg.id}`);
      }
      if (
        u.includes('microsoft.com') &&
        !pkg.id.toLowerCase().startsWith('microsoft.') &&
        !pkg.id.toLowerCase().startsWith('markrussinovich.')
      ) {
        throw new Error(`Detected generic microsoft.com favicon leak on non-Microsoft package ${pkg.id}`);
      }
    }
    invalidateIconCache();
  });

  // Suite 9: Custom Path Installation
  await runTest('Custom Path Installation', 'Builds safe argument vectors with --location', () => {
    const customPath = 'D:\\Software\\VSCode';
    const args = wingetEngine.buildInstallArgs('Microsoft.VisualStudioCode', {
      customLocation: customPath,
      silent: true,
    });
    if (!args.includes('--location') || !args.includes(customPath)) {
      throw new Error(`Missing --location parameter in install args: ${args.join(' ')}`);
    }
    const cliPreview = wingetEngine.formatCliPreview(args);
    if (!cliPreview.includes('--location "D:\\Software\\VSCode"')) {
      throw new Error(`Incorrect CLI formatting for custom location: ${cliPreview}`);
    }
  });

  // Suite 10: VS Code Official Blue Brand Guarantee
  await runTest('Icon Architecture', 'VS Code resolves strictly to official stable blue logo', async () => {
    const { resolveAppIcon, getIconRecord } = await import('../services/icons');
    const vscode = TEST_FIXTURE_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!;
    const resolved = resolveAppIcon(vscode);

    if (resolved.sourceType !== 'official-asset') {
      throw new Error(`Expected official-asset sourceType for VS Code, got ${resolved.sourceType}`);
    }
    if (!resolved.src.startsWith('data:image/svg+xml')) {
      throw new Error(`VS Code icon must be inline SVG data URI, got: ${resolved.src.slice(0, 50)}`);
    }
    const decoded = decodeURIComponent(resolved.src);
    if (!decoded.includes('#007ACC') && !decoded.includes('#0065A9')) {
      throw new Error('VS Code SVG is missing official blue brand color values');
    }
    if (decoded.includes('#238636') || decoded.includes('#D97706')) {
      throw new Error('VS Code SVG contains non-stable branch colors (green or orange)');
    }

    const lowerRecord = getIconRecord('microsoft.visualstudiocode');
    if (!lowerRecord || lowerRecord.packageId !== 'Microsoft.VisualStudioCode') {
      throw new Error('Case-insensitive lookup failed for microsoft.visualstudiocode');
    }
  });

  // Suite 11: Icon Cache Isolation, Fingerprint & Invalidation
  await runTest('Icon Architecture', 'Cache isolates entries by source+fingerprint and honors invalidation', async () => {
    const { resolveAppIconAsync, getCachedIcon, invalidateIconCache } = await import('../services/icons');
    invalidateIconCache();
    const pkg: Package = {
      id: 'Test.App.Cache',
      name: 'Test App',
      publisher: 'Test Publisher',
      version: '1.0.0',
      latestVersion: '1.0.0',
      description: 'Test app',
      category: 'Utilities',
      tags: [],
      source: 'winget',
      architectures: ['x64'],
      license: 'MIT',
      homepage: 'https://testapp.org',
      icon: 'https://cdn.example.com/icon-v1.png',
      releaseDate: '2024-01-01',
      verified: true,
    };

    const resolved = await resolveAppIconAsync(pkg, {
      validator: async () => ({ valid: true, width: 64, height: 64, mimeType: 'image/png' }),
    });
    if (!resolved.verified) {
      throw new Error('Expected verified icon from async resolver');
    }

    const cached = getCachedIcon('Test.App.Cache', 'winget');
    if (!cached || !cached.diagnostic.cacheHit) {
      throw new Error('Expected verified icon to be cached with cacheHit flag');
    }
    if (getCachedIcon('Test.App.Cache', 'msstore')) {
      throw new Error('Cache entry leaked across distinct package sources');
    }

    invalidateIconCache('Test.App.Cache', 'winget');
    const afterInvalidation = getCachedIcon('Test.App.Cache', 'winget');
    if (afterInvalidation) {
      throw new Error('Cache entry was not cleared after invalidateIconCache');
    }
  });

  // Suite 12: Icon Validator & Malformed Input Handling
  await runTest('Icon Architecture', 'Rejects dead repos, HTML error pages, XSS SVGs, and malformed URLs', async () => {
    const { isValidIconUrl, isGenericFaviconLeak, validateImageBytes } = await import('../services/icons');
    if (isValidIconUrl('https://raw.githubusercontent.com/microsoft/winget-pkgs/icons/foo.png')) {
      throw new Error('Should have rejected dead winget-pkgs repository URL');
    }
    if (isValidIconUrl('javascript:alert(1)')) {
      throw new Error('Should have rejected non-http script scheme URL');
    }
    if (!isValidIconUrl('https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_128x128.png')) {
      throw new Error('Should have accepted valid official CDN URL');
    }
    if (!isGenericFaviconLeak('https://microsoft.com/favicon.ico', 'Mozilla.Firefox')) {
      throw new Error('Should have detected generic microsoft.com favicon leak on Firefox');
    }

    const htmlBytes = new TextEncoder().encode('<!DOCTYPE html><html><body>404 Not Found</body></html>');
    if (validateImageBytes(htmlBytes, 'text/html').valid) {
      throw new Error('validateImageBytes must reject HTML pages');
    }

    const xssSvg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    if (validateImageBytes(xssSvg, 'image/svg+xml').valid) {
      throw new Error('validateImageBytes must reject SVG containing script tags');
    }

    const validPng = new Uint8Array(64);
    validPng.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    const pngCheck = validateImageBytes(validPng, 'image/png');
    if (!pngCheck.valid || pngCheck.mimeType !== 'image/png') {
      throw new Error(`Expected valid PNG magic check, got: ${JSON.stringify(pngCheck)}`);
    }
  });

  // Suite 13: Package Size Normalization & Propagation
  await runTest('Package Size Info', 'Formats bytes accurately and normalizes catalog & registry sizes', () => {
    if (formatBytes(0) !== '0 B' || formatBytes(-10) !== '0 B' || formatBytes(Number.NaN) !== '0 B') {
      throw new Error('formatBytes failed edge case handling');
    }
    if (formatBytes(1048576) !== '1 MB' || formatBytes(1610612736) !== '1.5 GB') {
      throw new Error(`Unexpected formatBytes output: ${formatBytes(1048576)}, ${formatBytes(1610612736)}`);
    }

    const basePkg: Package = {
      id: 'Test.SizePkg',
      name: 'Size Test',
      version: '1.0.0',
      latestVersion: '1.0.0',
      category: 'Uncategorized',
      tags: [],
      source: 'winget',
      architectures: ['x64'],
      verified: true,
    };

    const emptyNorm = normalizePackageStorage(basePkg);
    if (emptyNorm.formattedDownloadSize !== undefined || emptyNorm.formattedInstalledSize !== undefined) {
      throw new Error('normalizePackageStorage must keep missing sizes undefined instead of inventing 0 B');
    }

    const updatedNorm = normalizePackageStorage({
      ...basePkg,
      formattedDownloadSize: '1 KB',
      downloadSizeBytes: 5 * 1024 * 1024,
      installedSizeBytes: 25 * 1024 * 1024,
    });
    if (updatedNorm.formattedDownloadSize !== '5 MB' || updatedNorm.formattedInstalledSize !== '25 MB') {
      throw new Error(`normalizePackageStorage did not refresh formatted sizes: ${JSON.stringify(updatedNorm)}`);
    }

    for (const p of TEST_FIXTURE_PACKAGES) {
      const normalized = normalizePackageStorage(p);
      if (!normalized.downloadSizeBytes || !normalized.formattedDownloadSize) {
        throw new Error(`Fixture package ${p.id} is missing normalized download size`);
      }
      if (!normalized.installedSizeBytes || !normalized.formattedInstalledSize) {
        throw new Error(`Fixture package ${p.id} is missing normalized installed size`);
      }
    }

    storage.resetAllToDefaults();
    storage.reconcileCatalogSourceSnapshot('winget', TEST_FIXTURE_PACKAGES, true);
    const merged = storage.mergeRealSystemState(
      [
        {
          id: 'ARP\\Machine\\X64\\SizedLocalApp',
          name: 'Sized Local App',
          version: '2.1.0',
          isWingetManaged: false,
          installedSizeBytes: 120 * 1024 * 1024,
        },
        {
          id: '7zip.7zip',
          name: '7-Zip',
          version: '24.08',
          source: 'winget',
          isWingetManaged: true,
          installedSizeBytes: 8 * 1024 * 1024,
        },
      ],
      []
    );
    const localApp = merged.find(p => p.id === 'ARP\\Machine\\X64\\SizedLocalApp');
    const sevenZip = merged.find(p => p.id === '7zip.7zip');
    if (localApp?.formattedInstalledSize !== '120 MB') {
      throw new Error(`Expected 120 MB installed size on external app, got ${localApp?.formattedInstalledSize}`);
    }
    if (sevenZip?.formattedInstalledSize !== '8 MB') {
      throw new Error(`Expected live 8 MB registry override on 7-Zip, got ${sevenZip?.formattedInstalledSize}`);
    }
    storage.resetAllToDefaults();
  });

  // Suite 14: Async Icon Deduplication & Bounded Concurrency
  await runTest('Icon Architecture', 'Deduplicates in-flight fetches and enforces bounded concurrency <= 6', async () => {
    const { resolveAppIconAsync, invalidateIconCache } = await import('../services/icons');
    invalidateIconCache();

    let active = 0;
    let maxConcurrent = 0;
    let calls = 0;

    const validator = async () => {
      calls += 1;
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      await new Promise(r => setTimeout(r, 15));
      active -= 1;
      return { valid: true, width: 64, height: 64, mimeType: 'image/png' };
    };

    const dupPkg: Package = {
      id: 'Vendor.DupIcon',
      name: 'Dup Icon',
      version: '1.0',
      latestVersion: '1.0',
      category: 'Utilities',
      tags: [],
      source: 'winget',
      architectures: [],
      icon: 'https://cdn.example.com/dup.png',
      verified: true,
    };

    const [a, b, c] = await Promise.all([
      resolveAppIconAsync(dupPkg, { validator }),
      resolveAppIconAsync(dupPkg, { validator }),
      resolveAppIconAsync(dupPkg, { validator }),
    ]);

    if (calls !== 1 || !a.verified || !b.verified || !c.verified) {
      throw new Error(`Expected 3 concurrent calls to coalesce into 1 fetch, saw ${calls}`);
    }

    invalidateIconCache();
    calls = 0;
    const batch = Array.from({ length: 12 }, (_, idx) => ({
      ...dupPkg,
      id: `Vendor.Batch${idx}`,
      icon: `https://cdn.example.com/batch-${idx}.png`,
    }));

    await Promise.all(batch.map(p => resolveAppIconAsync(p, { validator })));
    if (maxConcurrent > 6) {
      throw new Error(`Icon fetch exceeded max concurrency 6: observed ${maxConcurrent}`);
    }
    invalidateIconCache();
  });

  // Suite 15: Canonical Operation Store Lifecycle, Sequence Ordering, Concurrency & Cancel
  await runTest('Operation Store', 'Enforces lifecycle phases, monotonic sequence, terminal immutability, concurrency, cancel & post-verify', async () => {
    const { applyOperationProgressEvent } = await import('../services/installationQueue');
    storage.resetAllToDefaults();
    installationQueue.resetForTesting();

    try {
      storage.saveSettings({ maxConcurrentDownloads: 2 });

      // 1) Monotonic sequence & terminal immutability
      const seqTask: InstallationTask = {
        id: 'task_seq',
        packageId: 'Vendor.Seq',
        packageName: 'Seq App',
        source: 'winget',
        action: 'install',
        version: '1.0',
        targetVersion: '1.0',
        status: 'preparing',
        phase: 'preparing',
        operationStatus: 'running',
        progress: 0,
        isIndeterminate: true,
        lastEventSequence: 0,
        queuedAt: 1000,
        startTime: 1000,
        logs: [],
        flags: {
          silent: true,
          force: false,
          acceptPackageAgreements: true,
          acceptSourceAgreements: true,
        },
      };

      const applied1 = applyOperationProgressEvent(seqTask, {
        taskId: 'task_seq',
        eventSequence: 2,
        phase: 'downloading',
        status: 'running',
        progressPercent: 45,
        isIndeterminate: false,
        bytesDownloaded: 450,
        totalBytes: 1000,
        stream: 'stdout',
        timestamp: 1001,
      });
      const rejectedStale = applyOperationProgressEvent(seqTask, {
        taskId: 'task_seq',
        eventSequence: 1,
        phase: 'preparing',
        status: 'running',
        progressPercent: 10,
        isIndeterminate: true,
        stream: 'stdout',
        timestamp: 1002,
      });
      if (!applied1 || rejectedStale || seqTask.progress !== 45 || seqTask.phase !== 'downloading') {
        throw new Error('Monotonic sequence check failed to guard against out-of-order events');
      }

      seqTask.status = 'completed';
      seqTask.phase = 'completed';
      seqTask.operationStatus = 'completed';
      const rejectedTerminal = applyOperationProgressEvent(seqTask, {
        taskId: 'task_seq',
        eventSequence: 3,
        phase: 'installing',
        status: 'running',
        progressPercent: 80,
        isIndeterminate: false,
        stream: 'stdout',
        timestamp: 1003,
      });
      if (rejectedTerminal || seqTask.progress !== 45) {
        throw new Error('Terminal state immutability guard failed');
      }

      // 2) Concurrency limit + full lifecycle + post-action verification
      let activeExec = 0;
      let maxConcurrentExec = 0;
      installationQueue.setTestingHooks({
        executor: async (task, _pkg, onProg) => {
          activeExec += 1;
          maxConcurrentExec = Math.max(maxConcurrentExec, activeExec);
          onProg({
            taskId: task.id,
            eventSequence: 1,
            phase: 'downloading',
            status: 'running',
            progressPercent: 50,
            isIndeterminate: false,
            bytesDownloaded: 5 * 1024 * 1024,
            totalBytes: 10 * 1024 * 1024,
            downloadSpeed: '2.5 MB/s',
            stream: 'stdout',
            timestamp: Date.now(),
          });
          await new Promise(r => setTimeout(r, 25));
          onProg({
            taskId: task.id,
            eventSequence: 2,
            phase: 'installing',
            status: 'running',
            isIndeterminate: true,
            stream: 'stdout',
            timestamp: Date.now(),
          });
          activeExec -= 1;
          return { success: true, exitCode: 0 };
        },
        verifier: async id => ({
          installed: id !== 'Vendor.VerifyFail',
          version: '2.0.0',
        }),
      });

      const mkPkg = (id: string): Package => ({
        id,
        name: id,
        version: '2.0.0',
        latestVersion: '2.0.0',
        category: 'Uncategorized',
        tags: [],
        source: 'winget',
        architectures: [],
        verified: true,
      });

      const t1 = installationQueue.enqueue(mkPkg('Vendor.One'), 'install');
      const t2 = installationQueue.enqueue(mkPkg('Vendor.Two'), 'install');
      const t3 = installationQueue.enqueue(mkPkg('Vendor.VerifyFail'), 'install');

      if (installationQueue.getActiveTasks().length > 2) {
        throw new Error('Active tasks exceeded maxConcurrentDownloads=2');
      }

      await new Promise(r => setTimeout(r, 120));
      if (maxConcurrentExec > 2) {
        throw new Error(`Executor exceeded concurrency slot limit 2: saw ${maxConcurrentExec}`);
      }

      const hist = storage.getHistoryTasks();
      const h1 = hist.find(t => t.id === t1.id);
      const h2 = hist.find(t => t.id === t2.id);
      const h3 = hist.find(t => t.id === t3.id);

      if (!h1 || h1.status !== 'completed' || h1.verifiedInstalledVersion !== '2.0.0' || !h1.startedAt || !h1.endedAt) {
        throw new Error(`Task 1 lifecycle/verification failed: ${JSON.stringify(h1)}`);
      }
      if (!h2 || h2.status !== 'completed') {
        throw new Error(`Task 2 failed: ${JSON.stringify(h2)}`);
      }
      if (!h3 || h3.status !== 'failed') {
        throw new Error(`Expected post-action verification failure for Vendor.VerifyFail, got ${h3?.status}`);
      }

      // 3) Retry when package was removed from catalog must succeed cleanly without fabricating fields
      storage.clearPackageCache();
      const retried = installationQueue.retry(h3.id);
      if (!retried || retried.packageId !== 'Vendor.VerifyFail') {
        throw new Error('Retry failed when package absent from catalog cache');
      }
      await new Promise(r => setTimeout(r, 60));

      // 4) Cancel active task awaits cancel handler cleanly
      let cancelAwaited = false;
      installationQueue.setTestingHooks({
        executor: async (_t, _p, _prog, _log, isCan) => {
          for (let i = 0; i < 20; i++) {
            if (isCan()) return { success: false, cancelled: true, exitCode: -1 };
            await new Promise(r => setTimeout(r, 10));
          }
          return { success: true, exitCode: 0 };
        },
        cancel: async () => {
          await new Promise(r => setTimeout(r, 15));
          cancelAwaited = true;
          return true;
        },
      });
      const cancelTask = installationQueue.enqueue(mkPkg('Vendor.CancelMe'), 'install');
      await installationQueue.cancel(cancelTask.id);
      const cancelledRec = storage.getHistoryTasks().find(t => t.id === cancelTask.id);
      if (!cancelAwaited || cancelledRec?.status !== 'cancelled' || !cancelledRec.endedAt) {
        throw new Error(`Cancel failed to await or record terminal state: awaited=${cancelAwaited}, status=${cancelledRec?.status}`);
      }
    } finally {
      installationQueue.resetForTesting();
      storage.resetAllToDefaults();
    }
  });

  // Suite 16: Canonical Operation Formatting Helpers
  await runTest('Operation Store', 'Formats byte ratios, durations, and exit codes accurately', async () => {
    const { formatByteRatio, formatDurationMs, formatExitCode } = await import('../components/operations/OperationStatus');
    if (formatByteRatio(5 * 1024 * 1024, 20 * 1024 * 1024) !== '5 MB / 20 MB') {
      throw new Error(`Unexpected byte ratio: ${formatByteRatio(5 * 1024 * 1024, 20 * 1024 * 1024)}`);
    }
    if (formatByteRatio(undefined, undefined) !== null) {
      throw new Error('Missing bytes must return null instead of fabricated ratio');
    }
    if (formatDurationMs(1000, 66000) !== '1m 05s') {
      throw new Error(`Unexpected duration format: ${formatDurationMs(1000, 66000)}`);
    }
    if (formatExitCode(0) !== 'Exit 0' || formatExitCode(-2147024891) !== '0x80070005') {
      throw new Error(`Unexpected exit code format: ${formatExitCode(-2147024891)}`);
    }
  });

  return results;
}
