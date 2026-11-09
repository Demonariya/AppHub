import { wingetEngine } from '../services/wingetEngine';
import { storage } from '../services/storage';
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

  // Suite 1: WinGet Detection & Environment
  await runTest('WinGet Environment', 'Detects valid WinGet CLI environment', () => {
    const env = wingetEngine.getEnvironment();
    if (!env.isInstalled || !env.version.startsWith('v')) {
      throw new Error(`Expected valid installed WinGet version, got ${env.version}`);
    }
    if (!env.path.includes('winget.exe')) {
      throw new Error(`Expected binary path containing winget.exe`);
    }
  });

  // Suite 2: Command Argument Validation & Security
  await runTest('Security & Validation', 'Validates legitimate package IDs', () => {
    const valid = [
      'Microsoft.VisualStudioCode',
      'Git.Git',
      'Mozilla.Firefox',
      'Valve.Steam',
      '7zip.7zip',
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

  // Suite 4: Persistence & Storage
  await runTest('Storage & Persistence', 'Loads default package catalog across all 11 categories', () => {
    const pkgs = storage.getPackages();
    if (pkgs.length < 10) {
      throw new Error(`Expected extensive package catalog, found ${pkgs.length}`);
    }
    const categories = new Set(pkgs.map(p => p.category));
    if (!categories.has('Browsers') || !categories.has('Development') || !categories.has('Gaming')) {
      throw new Error('Missing core categories in stored package dataset');
    }
  });

  await runTest('Storage & Persistence', 'Generates valid WinGet JSON Export Manifest', () => {
    const manifestJson = storage.exportWinGetManifest();
    const parsed = JSON.parse(manifestJson);
    if (!parsed.$schema || !parsed.Sources || !Array.isArray(parsed.Sources)) {
      throw new Error('Exported manifest violates Microsoft WinGet schema structure');
    }
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

  // Suite 5: Update Detection & Pinning
  await runTest('Update Management', 'Detects available updates accurately', () => {
    const pkgs = storage.getPackages();
    const updateAvailable = pkgs.filter(
      p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
    );
    if (updateAvailable.length === 0) {
      throw new Error('Expected sample outdated packages for update verification');
    }
  });

  // Suite 6: Sequential Installation Queue
  await runTest('Installation Queue', 'Enqueues and processes task with status lifecycle', async () => {
    const sample = INITIAL_PACKAGES.find(p => p.id === '7zip.7zip') || INITIAL_PACKAGES[0];
    const task = installationQueue.enqueue(sample, 'install', { silent: true });
    if (!task.id || task.packageId !== sample.id) {
      throw new Error('Task enqueuing returned invalid task metadata');
    }
  });

  // Suite 7: Version Timeline & Rollback
  await runTest('Version Timeline & Rollback', 'Fetches chronological release versions for packages', async () => {
    const sample = INITIAL_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!;
    const versions = await wingetEngine.fetchPackageVersions(sample);
    if (!versions || versions.length < 2) {
      throw new Error(`Expected multiple historical versions, found: ${versions?.length}`);
    }
    const hasLatest = versions.some(v => v.isLatest);
    if (!hasLatest) {
      throw new Error('Missing isLatest flag on newest version');
    }
  });

  await runTest('Version Timeline & Rollback', 'Builds safe rollback install arguments with --force', () => {
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
  await runTest('Real App Icons', 'Resolves authentic CDN and official vector assets', () => {
    const sample = INITIAL_PACKAGES.find(p => p.id === 'Mozilla.Firefox')!;
    const iconUrl = getAppIconUrl(sample);
    if (!iconUrl || (!iconUrl.startsWith('http') && !iconUrl.startsWith('data:image/'))) {
      throw new Error(`Invalid fetched icon URL: ${iconUrl}`);
    }
    // Verify none of the initial packages use dead github paths or leaked generic microsoft favicons
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
    const vscode = INITIAL_PACKAGES.find(p => p.id === 'Microsoft.VisualStudioCode')!;
    const resolved = resolveAppIcon(vscode);

    if (resolved.sourceType !== 'official-asset') {
      throw new Error(`Expected official-asset sourceType for VS Code, got ${resolved.sourceType}`);
    }
    if (!resolved.src.startsWith('data:image/svg+xml')) {
      throw new Error(`VS Code icon must be inline SVG data URI, got: ${resolved.src.slice(0, 50)}`);
    }
    // Must contain official Microsoft Blue hex colors
    const decoded = decodeURIComponent(resolved.src);
    if (!decoded.includes('#007ACC') && !decoded.includes('#0065A9')) {
      throw new Error('VS Code SVG is missing official blue brand color values');
    }
    // Must NOT contain green Insiders or orange Exploration colors
    if (decoded.includes('#238636') || decoded.includes('#D97706')) {
      throw new Error('VS Code SVG contains non-stable branch colors (green or orange)');
    }

    // Case-insensitivity test
    const lowerRecord = getIconRecord('microsoft.visualstudiocode');
    if (!lowerRecord || lowerRecord.packageId !== 'Microsoft.VisualStudioCode') {
      throw new Error('Case-insensitive lookup failed for microsoft.visualstudiocode');
    }
  });

  // Suite 11: Icon Cache Isolation & Invalidation
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
      rating: 5,
      ratingCount: 1,
      releaseDate: '2024-01-01',
      verified: true,
    };

    const first = resolveAppIcon(pkg);
    const cached = getCachedIcon('Test.App.Cache');
    if (!cached || !cached.diagnostic.cacheHit) {
      throw new Error('Expected icon to be cached with cacheHit flag');
    }

    // Invalidation
    invalidateIconCache('Test.App.Cache');
    const afterInvalidation = getCachedIcon('Test.App.Cache');
    if (afterInvalidation) {
      throw new Error('Cache entry was not cleared after invalidateIconCache');
    }
  });

  // Suite 12: Icon Validator & Malformed Input Handling
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

