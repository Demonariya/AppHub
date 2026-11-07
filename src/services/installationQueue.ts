import { Architecture, InstallationTask, Package, TaskAction } from '../types';
import { storage } from './storage';
import { wingetEngine } from './wingetEngine';

type QueueListener = (tasks: InstallationTask[], activeTask: InstallationTask | null) => void;

class InstallationQueueService {
  private queue: InstallationTask[] = [];
  private activeTask: InstallationTask | null = null;
  private isProcessing = false;
  private cancelFlags = new Map<string, boolean>();
  private listeners: Set<QueueListener> = new Set();

  constructor() {
    // Load any uncompleted tasks from local history or start clean
  }

  public subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    listener([...this.queue], this.activeTask);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener([...this.queue], this.activeTask);
    }
  }

  public getQueue(): InstallationTask[] {
    return [...this.queue];
  }

  public getActiveTask(): InstallationTask | null {
    return this.activeTask;
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
    this.notify();
    this.processNext();
    return task;
  }

  public cancel(taskId: string): void {
    this.cancelFlags.set(taskId, true);
    if (this.activeTask && this.activeTask.id === taskId) {
      this.activeTask.status = 'cancelled';
      this.activeTask.endTime = Date.now();
      storage.addHistoryTask(this.activeTask);
      this.notify();
    } else {
      const idx = this.queue.findIndex(t => t.id === taskId);
      if (idx !== -1) {
        const [cancelled] = this.queue.splice(idx, 1);
        cancelled.status = 'cancelled';
        cancelled.endTime = Date.now();
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
      architecture: task.flags.architecture,
    });
  }

  public clearQueue(): void {
    for (const task of this.queue) {
      task.status = 'cancelled';
      task.endTime = Date.now();
      storage.addHistoryTask(task);
    }
    this.queue = [];
    this.notify();
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;
    this.activeTask = task;
    this.notify();

    const packages = storage.getPackages();
    const pkg = packages.find(p => p.id === task.packageId);

    if (!pkg) {
      task.status = 'failed';
      task.error = `Package ${task.packageId} not found in repository`;
      task.endTime = Date.now();
      storage.addHistoryTask(task);
      this.activeTask = null;
      this.isProcessing = false;
      this.notify();
      this.processNext();
      return;
    }

    const isCancelled = () => !!this.cancelFlags.get(task.id);

    try {
      const result = await wingetEngine.executeTask(
        task,
        pkg,
        (progress, speed) => {
          task.progress = progress;
          task.downloadSpeed = speed;
          this.notify();
        },
        () => {
          this.notify();
        },
        isCancelled
      );

      task.endTime = Date.now();

      if (result.success) {
        task.status = 'completed';
        task.progress = 100;

        // Update installed state in local catalog
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
        task.status = isCancelled() ? 'cancelled' : 'failed';
        task.error = result.error || 'WinGet execution failed';
      }
    } catch (e) {
      task.status = 'failed';
      task.error = (e as Error).message;
      task.endTime = Date.now();
    } finally {
      storage.addHistoryTask(task);
      this.activeTask = null;
      this.isProcessing = false;
      this.notify();
      this.processNext();
    }
  }
}

export const installationQueue = new InstallationQueueService();
