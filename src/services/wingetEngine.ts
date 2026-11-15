import {
  Architecture,
  InstallationTask,
  Package,
  PackageVersionInfo,
  TaskLogEntry,
  WinGetEnvironment,
} from '../types';
import { isTauriEnvironment, invokeCommand, tryInvokeCommand } from './tauriBridge';
import { storage } from './storage';

export interface WinGetCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  executionTimeMs: number;
  parsedData?: any;
}

export type LogListener = (entry: TaskLogEntry) => void;
export type ProgressListener = (
  progress: number,
  options?: { speed?: string; isIndeterminate?: boolean; status?: InstallationTask['status'] }
) => void;

interface NativeWinGetOutputEvent {
  task_id: string;
  stream: string;
  line: string;
  progress: number | null;
  is_indeterminate: boolean;
  download_speed: string | null;
  phase: string | null;
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
    if (!id || typeof id !== 'string') return false;
    const regex = /^[A-Za-z0-9_+-]+(\.[A-Za-z0-9_+-]+)+$/;
    return regex.test(id) && id.length <= 128;
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
        if (a.includes(' ') || (idx > 0 && args[idx - 1] === '--location')) {
          return `"${a}"`;
        }
        return a;
      })
      .join(' ')}`;
  }

  /**
   * Executes real `winget search` via native backend.
   * Throws when native execution fails so UI can show an explicit error & retry state instead of fake results.
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
    return (rawResults || []).map(r => ({
      id: r.id,
      name: r.name || r.id,
      publisher: r.publisher || r.id.split('.')[0] || 'Unknown',
      version: r.version || 'Unknown',
      latestVersion: r.latest_version || r.version || 'Unknown',
      description: r.description || `WinGet package ${r.id}`,
      category: (r.category || 'Utilities') as any,
      tags: [r.source || 'winget'],
      source: (r.source === 'msstore' ? 'msstore' : r.source === 'winget' ? 'winget' : 'custom') as any,
      architectures: (r.architectures || ['x64']) as any,
      license: r.license || 'See package details',
      homepage: r.homepage || '',
      releaseDate: '',
      verified: r.source === 'winget' || r.source === 'msstore',
      isInstalled: Boolean(r.is_installed),
      installedVersion: r.installed_version || undefined,
    }));
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
   * Executes real `winget show --id <id>` via native backend.
   */
  public async showPackageDetails(packageId: string): Promise<Partial<Package> | null> {
    if (!this.isValidPackageId(packageId)) return null;
    if (!isTauriEnvironment()) return null;

    const wingetPath = storage.getSettings().wingetPath || null;
    const details = await invokeCommand<any>('winget_show', {
      packageId,
      wingetPath,
    });
    if (!details) return null;

    return {
      name: details.name,
      publisher: details.publisher,
      author: details.author || undefined,
      version: details.version,
      latestVersion: details.version,
      description: details.description || undefined,
      longDescription: details.description || undefined,
      homepage: details.homepage || undefined,
      publisherUrl: details.publisher_url || undefined,
      license: details.license || undefined,
      licenseUrl: details.license_url || undefined,
      releaseDate: details.release_date || undefined,
      releaseNotes: details.release_notes || undefined,
      installerType: details.installer_type || undefined,
      installerUrl: details.installer_url || undefined,
      sha256: details.installer_sha256 || undefined,
      tags: Array.isArray(details.tags) && details.tags.length > 0 ? details.tags : undefined,
    };
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

    const addLog = (level: TaskLogEntry['level'], message: string) => {
      const entry: TaskLogEntry = { timestamp: timestamp(), level, message };
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

    addLog('info', `> ${this.formatCliPreview(args)}`);

    if (!this.isValidPackageId(task.packageId)) {
      addLog('error', `Invalid package identifier '${task.packageId}'`);
      return { success: false, error: 'Invalid package identifier', exitCode: 1 };
    }

    if (isCancelled()) {
      addLog('warn', `Operation cancelled before execution.`);
      return { success: false, error: 'Cancelled by user', cancelled: true, exitCode: -1 };
    }

    if (isTauriEnvironment()) {
      let unlisten: (() => void) | null = null;
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<NativeWinGetOutputEvent>('winget-output', event => {
          const payload = event.payload;
          if (!payload || payload.task_id !== task.id) return;

          if (payload.line) {
            const lower = payload.line.toLowerCase();
            const level: TaskLogEntry['level'] =
              payload.stream === 'stderr' || lower.includes('error') || lower.includes('failed')
                ? 'error'
                : lower.includes('successfully')
                ? 'success'
                : 'info';
            addLog(level, payload.line);
          }

          const phaseStatus = payload.phase as InstallationTask['status'] | null;
          if (payload.progress !== null && payload.progress !== undefined) {
            onProgress(payload.progress, {
              isIndeterminate: false,
              speed: payload.download_speed || undefined,
              status: phaseStatus || undefined,
            });
          } else {
            onProgress(task.progress, {
              isIndeterminate: payload.is_indeterminate,
              status: phaseStatus || undefined,
            });
          }
        });

        task.status = task.action === 'uninstall' ? 'installing' : 'downloading';
        onProgress(0, { isIndeterminate: true, status: task.status });
        addLog('info', `Starting WinGet process...`);

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
          addLog('warn', `WinGet operation cancelled.`);
          return {
            success: false,
            error: 'Cancelled by user',
            exitCode: result.exit_code,
            cancelled: true,
          };
        }

        if (result.success && result.exit_code === 0) {
          onProgress(100, { isIndeterminate: false, status: 'completed' });
          addLog('success', `WinGet exited with code 0 (${pkg.id})`);
          return { success: true, exitCode: 0 };
        } else {
          const errCodeHex = `0x${(result.exit_code >>> 0).toString(16).toUpperCase()}`;
          addLog('error', `WinGet exited with code ${result.exit_code} (${errCodeHex})`);
          return {
            success: false,
            error: result.stderr?.trim() || `WinGet exited with code ${result.exit_code} (${errCodeHex})`,
            exitCode: result.exit_code,
          };
        }
      } catch (nativeErr: any) {
        const msg = nativeErr?.message || String(nativeErr);
        addLog('error', `Execution error: ${msg}`);
        return { success: false, error: msg, exitCode: -1 };
      } finally {
        if (unlisten) unlisten();
      }
    }

    // Outside Tauri (browser preview / Node test environment): fail honestly without pretending WinGet ran
    addLog(
      'error',
      `Native WinGet CLI cannot run inside a browser preview. Launch the AppHub Windows desktop app to execute '${this.formatCliPreview(args)}'.`
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

  public async getSources(): Promise<Array<{ name: string; argument: string; isOfficial: boolean }>> {
    if (isTauriEnvironment()) {
      const wingetPath = storage.getSettings().wingetPath || null;
      const raw = await invokeCommand<any[]>('winget_source_list', { wingetPath });
      return (raw || []).map(s => ({
        name: s.name,
        argument: s.argument,
        isOfficial: Boolean(s.is_official),
      }));
    }
    return [
      { name: 'winget', argument: 'https://cdn.winget.microsoft.com/cache', isOfficial: true },
      { name: 'msstore', argument: 'https://storeedgefd.dsx.mp.microsoft.com/v9.0', isOfficial: true },
    ];
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
        downloadSize: pkg.formattedSize,
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
