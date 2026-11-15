import { wingetEngine } from '../services/wingetEngine';
import { DEFAULT_SOURCES, storage } from '../services/storage';
import { installationQueue } from '../services/installationQueue';
import { INITIAL_PACKAGES } from '../services/catalog';
import { Package } from '../types';
import { getAppIconUrl } from '../services/iconService';

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
  await runTest('Security & Validation', 'Validates legitimate package IDs including plus signs', () => {
    const valid = [
      'Microsoft.VisualStudioCode',
      'Git.Git',
      'Mozilla.Firefox',
      'Valve.Steam',
      '7zip.7zip',
      'Notepad++.Notepad++',
      'OpenJS.NodeJS.LTS',
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
      'Microsoft.VSCode; rm -rf /',
      'pkg$(calc.exe)',
      'id with spaces.app',
      '../escape/path',
    ];
    for (const id of malicious) {
      if (wingetEngine.isValidPackageId(id)) {
        throw new Error(`Malicious ID improperly accepted: ${id}`);
      }
    }
  });

  // Suite 3: Safe Argument Vectors (No shell string concatenation)
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

  // Suite 4: Persistence, Integrity & Zero Fake Data
  await runTest('Storage & Persistence', 'Loads curated catalog across categories with zero fake metrics', () => {
    storage.resetAllToDefaults();
    const pkgs = storage.getPackages();
    if (pkgs.length < 10) {
      throw new Error(`Expected extensive package catalog, found ${pkgs.length}`);
    }
    const categories = new Set(pkgs.map(p => p.category));
    if (!categories.has('Browsers') || !categories.has('Development') || !categories.has('Gaming')) {
      throw new Error('Missing core categories in stored package dataset');
    }
    for (const p of INITIAL_PACKAGES) {
      if (p.isInstalled) {
        throw new Error(`Catalog package ${p.id} must not hardcode isInstalled: true`);
      }
      if (p.ratingCount !== undefined || p.rating !== undefined) {
        throw new Error(`Catalog package ${p.id} still carries fake rating fields`);
      }
      if (p.formattedSize === '45 MB' || p.formattedInstalledSize === '~150 MB') {
        throw new Error(`Catalog package ${p.id} still carries hardcoded placeholder size`);
      }
    }
    if (DEFAULT_SOURCES.some(s => s.arg.includes('apphub.internal'))) {
      throw new Error('DEFAULT_SOURCES still contains fake apphub.internal source');
    }
  });

  await runTest('Storage & Persistence', 'Persists favorites, settings, and external WinGet reconciliation', () => {
    storage.resetAllToDefaults();
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

  // Suite 5: Installation Queue & Honest Non-Tauri Failure
  await runTest('Installation Queue', 'Prevents duplicate operations and fails honestly outside desktop runtime', async () => {
    const sample = INITIAL_PACKAGES.find(p => p.id === '7zip.7zip') || INITIAL_PACKAGES[0];
    const task1 = installationQueue.enqueue(sample, 'install', { silent: true, targetVersion: '24.08' });
    const task2 = installationQueue.enqueue(sample, 'install', { silent: true });

    if (task1.id !== task2.id) {
      throw new Error('Expected duplicate enqueue for same package to return existing task');
    }
    if (task1.targetVersion !== '24.08') {
      throw new Error(`Expected targetVersion 24.08 on task, got ${task1.targetVersion}`);
    }

    // Wait a tick for async non-Tauri rejection completion
    await new Promise(resolve => setTimeout(resolve, 30));
    const history = storage.getHistoryTasks();
    const recorded = history.find(t => t.id === task1.id);
    if (!recorded || recorded.status !== 'failed') {
      throw new Error(`Expected honest failure in non-Tauri environment, got status=${recorded?.status}`);
    }
    storage.resetAllToDefaults();
  });

  // Suite 6: Version Timeline & Rollback
  await runTest('Version Timeline & Rollback', 'Returns catalog latest + installed version honestly and builds rollback args', async () => {
    const sample: Package = {
      ...INITIAL_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!,
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

  // Suite 7: Real App Icons & Hierarchy
  await runTest('Real App Icons', 'Resolves authentic CDN and official vector assets', () => {
    const sample = INITIAL_PACKAGES.find(p => p.id === 'Mozilla.Firefox')!;
    const iconUrl = getAppIconUrl(sample);
    if (!iconUrl || (!iconUrl.startsWith('http') && !iconUrl.startsWith('data:image/'))) {
      throw new Error(`Invalid fetched icon URL: ${iconUrl}`);
    }
    for (const pkg of INITIAL_PACKAGES) {
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
  });

  // Suite 8: Custom Path Installation
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

  // Suite 9: VS Code Official Blue Brand Guarantee
  await runTest('Icon Architecture', 'VS Code resolves strictly to official stable blue logo', async () => {
    const { resolveAppIcon, getIconRecord } = await import('../services/icons');
    const vscode = INITIAL_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!;
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

  // Suite 10: Icon Cache Isolation & Invalidation
  await runTest('Icon Architecture', 'Cache isolates entries and honors invalidation', async () => {
    const { resolveAppIcon, getCachedIcon, invalidateIconCache } = await import('../services/icons');
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
      releaseDate: '2024-01-01',
      verified: true,
    };

    resolveAppIcon(pkg);
    const cached = getCachedIcon('Test.App.Cache');
    if (!cached || !cached.diagnostic.cacheHit) {
      throw new Error('Expected icon to be cached with cacheHit flag');
    }

    invalidateIconCache('Test.App.Cache');
    const afterInvalidation = getCachedIcon('Test.App.Cache');
    if (afterInvalidation) {
      throw new Error('Cache entry was not cleared after invalidateIconCache');
    }
  });

  // Suite 11: Icon Validator & Malformed Input Handling
  await runTest('Icon Architecture', 'Rejects dead repos and malformed URLs', async () => {
    const { isValidIconUrl, isGenericFaviconLeak } = await import('../services/icons');
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
  });

  return results;
}
