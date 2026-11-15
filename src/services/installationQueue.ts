import { Architecture, InstallationTask, Package, TaskAction } from '../types';
import { storage } from './storage';
import { wingetEngine } from './wingetEngine';

type QueueListener = (
  tasks: InstallationTask[],
  activeTasks: InstallationTask[],
  primaryActive: InstallationTask | null
) => void;
type CompletionListener = (task: InstallationTask) => void;

class InstallationQueueService {
  private queue: InstallationTask[] = [];
  private activeTasks: Map<string, InstallationTask> = new Map();
  private cancelFlags = new Map<string, boolean>();
  private listeners: Set<QueueListener> = new Set();
  private completionListeners: Set<CompletionListener> = new Set();

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    const actives = Array.from(this.activeTasks.values());
    listener([...this.queue], actives, actives[0] || null);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public onTaskCompleted(listener: CompletionListener): () => void {
    this.completionListeners.add(listener);
    return () => {
      this.completionListeners.delete(listener);
    };
  }

  private notify(): void {
    const actives = Array.from(this.activeTasks.values());
    const primary = actives[0] || null;
    for (const listener of this.listeners) {
      listener([...this.queue], actives, primary);
    }
  }

  public getQueue(): InstallationTask[] {
    return [...this.queue];
  }

  public getActiveTask(): InstallationTask | null {
    return Array.from(this.activeTasks.values())[0] || null;
  }

  public getActiveTasks(): InstallationTask[] {
    return Array.from(this.activeTasks.values());
  }

  public hasPendingOrActiveForPackage(packageId: string): boolean {
    if (Array.from(this.activeTasks.values()).some(t => t.packageId === packageId)) {
      return true;
    }
    return this.queue.some(t => t.packageId === packageId);
  }

  public enqueue(
    pkg: Package,
    action: TaskAction,
    options: {
      targetVersion?: string;
      silent?: boolean;
      force?: boolean;
      architecture?: Architecture;
      customLocation?: string;
    } = {}
  ): InstallationTask {
    // Prevent duplicate concurrent or queued operations for the same package
    const existingActive = Array.from(this.activeTasks.values()).find(
      t => t.packageId === pkg.id
    );
    if (existingActive) {
      return existingActive;
    }
    const existingQueued = this.queue.find(t => t.packageId === pkg.id);
    if (existingQueued) {
      return existingQueued;
    }

    const settings = storage.getSettings();
    const task: InstallationTask = {
      id: `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      packageId: pkg.id,
      packageName: pkg.name,
      action,
      version: pkg.isInstalled && pkg.installedVersion ? pkg.installedVersion : pkg.version,
      targetVersion: options.targetVersion || pkg.latestVersion,
      status: 'queued',
      progress: 0,
      isIndeterminate: true,
      startTime: Date.now(),
      logs: [],
      flags: {
        silent: options.silent ?? settings.silentInstall,
        force: options.force ?? false,
        acceptPackageAgreements: settings.autoAcceptAgreements,
        acceptSourceAgreements: settings.autoAcceptAgreements,
        architecture: options.architecture ?? settings.preferredArchitecture,
        customLocation: options.customLocation,
      },
    };

    this.queue.push(task);
    this.cancelFlags.set(task.id, false);
    storage.addHistoryTask(task);
    this.notify();
    this.pumpQueue();
    return task;
  }

  public async cancel(taskId: string): Promise<void> {
    this.cancelFlags.set(taskId, true);
    const active = this.activeTasks.get(taskId);
    if (active) {
      await wingetEngine.cancelTask(taskId);
      active.status = 'cancelled';
      active.endTime = Date.now();
      active.error = 'Cancelled by user';
      storage.addHistoryTask(active);
      this.notify();
    } else {
      const idx = this.queue.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        const [cancelled] = this.queue.splice(idx, 1);
        cancelled.status = 'cancelled';
        cancelled.endTime = Date.now();
        cancelled.error = 'Cancelled by user';
        storage.addHistoryTask(cancelled);
        this.notify();
      }
    }
  }

  public retry(taskId: string): void {
    const history = storage.getHistoryTasks();
    const task = history.find(t => t.id === taskId);
    if (!task) return;

    const packages = storage.getPackages();
    const pkg = packages.find(p => p.id === task.packageId);
    if (!pkg) return;

    this.enqueue(pkg, task.action, {
      targetVersion: task.targetVersion,
      silent: task.flags.silent,
      force: task.flags.force,
      architecture: task.flags.architecture,
      customLocation: task.flags.customLocation,
    });
  }

  public clearQueue(): void {
    for (const task of this.queue) {
      task.status = 'cancelled';
      task.endTime = Date.now();
      task.error = 'Cleared from queue';
      storage.addHistoryTask(task);
    }
    this.queue = [];
    this.notify();
  }

  private pumpQueue(): void {
    const maxConcurrency = Math.max(1, Math.min(4, storage.getSettings().maxConcurrentDownloads || 1));
    while (this.activeTasks.size < maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      void this.runTask(next);
    }
  }

  private async runTask(task: InstallationTask): Promise<void> {
    this.activeTasks.set(task.id, task);
    this.notify();

    const packages = storage.getPackages();
    const pkg = packages.find(p => p.id === task.packageId) || {
      id: task.packageId,
      name: task.packageName,
      publisher: task.packageId.split('.')[0] || 'Unknown',
      version: task.version,
      latestVersion: task.targetVersion || task.version,
      description: '',
      category: 'Utilities' as const,
      tags: [],
      source: 'winget' as const,
      architectures: ['x64' as const],
      license: 'Unknown',
      homepage: '',
      releaseDate: '',
      verified: true,
    };

    const isCancelled = () => !!this.cancelFlags.get(task.id);

    try {
      const result = await wingetEngine.executeTask(
        task,
        pkg,
        (progress, opts) => {
          task.progress = progress;
          if (opts?.speed !== undefined) task.downloadSpeed = opts.speed;
          if (opts?.isIndeterminate !== undefined) task.isIndeterminate = opts.isIndeterminate;
          if (opts?.status !== undefined) task.status = opts.status;
          this.notify();
        },
        () => {
          this.notify();
        },
        isCancelled
      );

      task.endTime = Date.now();
      task.exitCode = result.exitCode;
      task.isIndeterminate = false;

      if (result.success) {
        task.status = 'completed';
        task.progress = 100;

        if (task.action === 'uninstall') {
          storage.updatePackage(pkg.id, {
            isInstalled: false,
            installedVersion: undefined,
            installedDate: undefined,
          });
        } else {
          storage.updatePackage(pkg.id, {
            isInstalled: true,
            installedVersion: task.targetVersion || pkg.latestVersion,
            installedDate: new Date().toISOString().split('T')[0],
          });
        }
      } else {
        task.status = result.cancelled || isCancelled() ? 'cancelled' : 'failed';
        task.error = result.error || 'WinGet execution failed';
      }
    } catch (e) {
      task.status = 'failed';
      task.error = (e as Error).message;
      task.endTime = Date.now();
      task.exitCode = -1;
    } finally {
      storage.addHistoryTask(task);
      this.activeTasks.delete(task.id);
      for (const cb of this.completionListeners) {
        try {
          cb(task);
        } catch {
          // ignore listener errors
        }
      }
      this.notify();
      this.pumpQueue();
    }
  }
}

export const installationQueue = new InstallationQueueService();
