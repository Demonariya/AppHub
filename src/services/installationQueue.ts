import {
  Architecture,
  InstallationTask,
  OperationPhase,
  OperationProgressEvent,
  OperationStatus,
  Package,
  TaskAction,
  TaskLogEntry,
} from '../types';
import { getPackageKey } from './catalog';
import { storage } from './storage';
import { wingetEngine } from './wingetEngine';

type QueueListener = (
  tasks: InstallationTask[],
  activeTasks: InstallationTask[],
  primaryActive: InstallationTask | null
) => void;
type CompletionListener = (task: InstallationTask) => void;

export type TaskExecutorFn = (
  task: InstallationTask,
  pkg: Package,
  onProgress: (event: OperationProgressEvent) => void,
  onLog: (entry: TaskLogEntry) => void,
  isCancelled: () => boolean
) => Promise<{ success: boolean; error?: string; exitCode?: number; cancelled?: boolean }>;

export type TaskVerifyFn = (
  packageId: string
) => Promise<{ installed: boolean; version?: string } | null>;

export function isTerminalPhase(phase?: string): boolean {
  return phase === 'completed' || phase === 'failed' || phase === 'cancelled';
}

export function isTerminalOperationStatus(status?: OperationStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

export function phaseToOperationStatus(phase: OperationPhase): OperationStatus {
  if (phase === 'queued') return 'queued';
  if (phase === 'completed') return 'completed';
  if (phase === 'failed') return 'failed';
  if (phase === 'cancelled') return 'cancelled';
  return 'running';
}

/**
 * Applies a structured OperationProgressEvent to a task in the canonical store.
 * Enforces:
 * - Terminal state immutability (ignores events after completed/failed/cancelled)
 * - Monotonic eventSequence ordering (ignores out-of-order or duplicate sequences)
 */
export function applyOperationProgressEvent(
  task: InstallationTask,
  ev: OperationProgressEvent
): boolean {
  if (
    isTerminalPhase(task.status) ||
    isTerminalPhase(task.phase) ||
    isTerminalOperationStatus(task.operationStatus)
  ) {
    return false;
  }

  const lastSeq = task.lastEventSequence ?? 0;
  if (ev.eventSequence <= lastSeq) {
    return false;
  }

  task.lastEventSequence = ev.eventSequence;

  if (ev.phase && !isTerminalPhase(ev.phase)) {
    task.phase = ev.phase;
    task.status = ev.phase;
    task.operationStatus = phaseToOperationStatus(ev.phase);
  } else if (!ev.phase) {
    task.operationStatus = ev.status;
  }

  task.isIndeterminate = ev.isIndeterminate;

  if (typeof ev.progressPercent === 'number' && !Number.isNaN(ev.progressPercent)) {
    task.progress = Math.max(0, Math.min(100, Math.round(ev.progressPercent)));
  }
  if (typeof ev.bytesDownloaded === 'number' && ev.bytesDownloaded >= 0) {
    task.bytesDownloaded = ev.bytesDownloaded;
  }
  if (typeof ev.totalBytes === 'number' && ev.totalBytes > 0) {
    task.totalBytes = ev.totalBytes;
  }
  if (ev.downloadSpeed !== undefined) {
    task.downloadSpeed = ev.downloadSpeed;
  }
  if (ev.message) {
    task.statusMessage = ev.message;
  }

  return true;
}

function isSamePackageTarget(
  target: { packageId?: string; id?: string; source?: string },
  pkgId: string,
  pkgSource?: string
): boolean {
  const targetId = target.packageId ?? target.id ?? '';
  if (targetId.toLowerCase() !== pkgId.toLowerCase()) return false;
  if (target.source && pkgSource) {
    return target.source.toLowerCase() === pkgSource.toLowerCase();
  }
  return true;
}

class InstallationQueueService {
  private queue: InstallationTask[] = [];
  private activeTasks: Map<string, InstallationTask> = new Map();
  private cancelFlags = new Map<string, boolean>();
  private cancelPromises = new Map<string, Promise<void>>();
  private listeners: Set<QueueListener> = new Set();
  private completionListeners: Set<CompletionListener> = new Set();
  private customExecutor: TaskExecutorFn | null = null;
  private customVerifier: TaskVerifyFn | null = null;
  private customCancelFn: ((taskId: string) => Promise<boolean>) | null = null;

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

  public getTaskById(taskId: string): InstallationTask | null {
    const active = this.activeTasks.get(taskId);
    if (active) return active;
    const queued = this.queue.find(t => t.id === taskId);
    if (queued) return queued;
    return storage.getHistoryTasks().find(t => t.id === taskId) || null;
  }

  public hasPendingOrActiveForPackage(packageId: string, source?: string): boolean {
    if (
      Array.from(this.activeTasks.values()).some(t =>
        isSamePackageTarget(t, packageId, source)
      )
    ) {
      return true;
    }
    return this.queue.some(t => isSamePackageTarget(t, packageId, source));
  }

  public setTestingHooks(hooks: {
    executor?: TaskExecutorFn | null;
    verifier?: TaskVerifyFn | null;
    cancel?: ((taskId: string) => Promise<boolean>) | null;
  } | null): void {
    this.customExecutor = hooks?.executor ?? null;
    this.customVerifier = hooks?.verifier ?? null;
    this.customCancelFn = hooks?.cancel ?? null;
  }

  public resetForTesting(): void {
    this.queue = [];
    this.activeTasks.clear();
    this.cancelFlags.clear();
    this.cancelPromises.clear();
    this.customExecutor = null;
    this.customVerifier = null;
    this.customCancelFn = null;
    this.notify();
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
    const existingActive = Array.from(this.activeTasks.values()).find(t =>
      isSamePackageTarget(t, pkg.id, pkg.source)
    );
    if (existingActive) {
      return existingActive;
    }
    const existingQueued = this.queue.find(t => isSamePackageTarget(t, pkg.id, pkg.source));
    if (existingQueued) {
      return existingQueued;
    }

    const now = Date.now();
    const settings = storage.getSettings();
    const task: InstallationTask = {
      id: `task_${now}_${Math.random().toString(36).substring(2, 7)}`,
      packageId: pkg.id,
      packageName: pkg.name,
      source: pkg.source,
      action,
      version: pkg.isInstalled && pkg.installedVersion ? pkg.installedVersion : pkg.version,
      targetVersion: options.targetVersion || pkg.latestVersion,
      status: 'queued',
      phase: 'queued',
      operationStatus: 'queued',
      progress: 0,
      isIndeterminate: true,
      lastEventSequence: 0,
      statusMessage: 'Queued for execution',
      queuedAt: now,
      startTime: now,
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
    const existingPromise = this.cancelPromises.get(taskId);
    if (existingPromise) {
      return existingPromise;
    }

    const runCancel = async () => {
      this.cancelFlags.set(taskId, true);
      const active = this.activeTasks.get(taskId);
      if (active) {
        if (!isTerminalPhase(active.status)) {
          active.statusMessage = 'Cancelling operation...';
          this.notify();
        }
        const cancelImpl = this.customCancelFn ?? (id => wingetEngine.cancelTask(id));
        await cancelImpl(taskId);
        if (!isTerminalPhase(active.status)) {
          const endedAt = Date.now();
          active.status = 'cancelled';
          active.phase = 'cancelled';
          active.operationStatus = 'cancelled';
          active.endedAt = endedAt;
          active.endTime = endedAt;
          active.isIndeterminate = false;
          active.statusMessage = 'Cancelled by user';
          active.error = 'Cancelled by user';
          storage.addHistoryTask(active);
          this.notify();
        }
      } else {
        const idx = this.queue.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          const [cancelled] = this.queue.splice(idx, 1);
          const endedAt = Date.now();
          cancelled.status = 'cancelled';
          cancelled.phase = 'cancelled';
          cancelled.operationStatus = 'cancelled';
          cancelled.endedAt = endedAt;
          cancelled.endTime = endedAt;
          cancelled.isIndeterminate = false;
          cancelled.statusMessage = 'Cancelled before start';
          cancelled.error = 'Cancelled by user';
          storage.addHistoryTask(cancelled);
          this.notify();
        }
      }
    };

    const promise = runCancel().finally(() => {
      this.cancelPromises.delete(taskId);
    });
    this.cancelPromises.set(taskId, promise);
    return promise;
  }

  public retry(taskId: string): InstallationTask | null {
    const history = storage.getHistoryTasks();
    const task = history.find(t => t.id === taskId);
    if (!task) return null;

    const packages = storage.getPackages();
    const pkg =
      packages.find(p =>
        task.source
          ? p.id.toLowerCase() === task.packageId.toLowerCase() &&
            p.source.toLowerCase() === task.source.toLowerCase()
          : p.id.toLowerCase() === task.packageId.toLowerCase()
      ) || {
        id: task.packageId,
        packageKey: getPackageKey(task.packageId, task.source || 'winget'),
        name: task.packageName || task.packageId,
        version: task.version || 'Unknown',
        latestVersion: task.targetVersion || task.version || 'Unknown',
        category: 'Uncategorized' as const,
        tags: [],
        source: task.source || 'winget',
        architectures: [],
        verified: false,
      };

    return this.enqueue(pkg, task.action, {
      targetVersion: task.targetVersion,
      silent: task.flags.silent,
      force: task.flags.force,
      architecture: task.flags.architecture,
      customLocation: task.flags.customLocation,
    });
  }

  public clearQueue(): void {
    const now = Date.now();
    for (const task of this.queue) {
      task.status = 'cancelled';
      task.phase = 'cancelled';
      task.operationStatus = 'cancelled';
      task.endedAt = now;
      task.endTime = now;
      task.isIndeterminate = false;
      task.statusMessage = 'Cleared from queue';
      task.error = 'Cleared from queue';
      storage.addHistoryTask(task);
    }
    this.queue = [];
    this.notify();
  }

  private pumpQueue(): void {
    const maxConcurrency = Math.max(
      1,
      Math.min(4, storage.getSettings().maxConcurrentDownloads || 1)
    );
    while (this.activeTasks.size < maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      void this.runTask(next);
    }
  }

  private async runTask(task: InstallationTask): Promise<void> {
    const startedAt = Date.now();
    task.startedAt = startedAt;
    task.startTime = startedAt;
    task.status = 'preparing';
    task.phase = 'preparing';
    task.operationStatus = 'running';
    task.isIndeterminate = true;
    task.statusMessage = 'Preparing operation...';

    this.activeTasks.set(task.id, task);
    storage.addHistoryTask(task);
    this.notify();

    const packages = storage.getPackages();
    const pkg: Package =
      packages.find(p => isSamePackageTarget(p, task.packageId, task.source)) || {
        id: task.packageId,
        packageKey: getPackageKey(task.packageId, task.source || 'winget'),
        name: task.packageName || task.packageId,
        version: task.version || 'Unknown',
        latestVersion: task.targetVersion || task.version || 'Unknown',
        category: 'Uncategorized',
        tags: [],
        source: task.source || 'winget',
        architectures: [],
        verified: false,
      };

    const isCancelled = () => !!this.cancelFlags.get(task.id);
    const executor: TaskExecutorFn =
      this.customExecutor ??
      ((t, p, onProg, onLog, isCan) => wingetEngine.executeTask(t, p, onProg, onLog, isCan));
    const verifier: TaskVerifyFn =
      this.customVerifier ?? (id => wingetEngine.verifyPackageInstallationState(id));

    try {
      const result = await executor(
        task,
        pkg,
        event => {
          if (applyOperationProgressEvent(task, event)) {
            this.notify();
          }
        },
        () => {
          this.notify();
        },
        isCancelled
      );

      if (isTerminalPhase(task.status)) {
        return;
      }

      task.exitCode = result.exitCode;

      if (result.cancelled || isCancelled()) {
        const endedAt = Date.now();
        task.status = 'cancelled';
        task.phase = 'cancelled';
        task.operationStatus = 'cancelled';
        task.endedAt = endedAt;
        task.endTime = endedAt;
        task.isIndeterminate = false;
        task.statusMessage = 'Cancelled by user';
        task.error = result.error || 'Cancelled by user';
        return;
      }

      if (result.success && result.exitCode === 0) {
        task.phase = 'verifying';
        task.status = 'verifying';
        task.operationStatus = 'running';
        task.isIndeterminate = true;
        task.statusMessage = 'Verifying package installation state...';
        this.notify();

        const verification = await verifier(pkg.id);
        const endedAt = Date.now();
        task.endedAt = endedAt;
        task.endTime = endedAt;
        task.isIndeterminate = false;

        if (verification !== null) {
          if (task.action === 'uninstall') {
            if (verification.installed) {
              task.status = 'failed';
              task.phase = 'failed';
              task.operationStatus = 'failed';
              task.statusMessage = 'Verification failed';
              task.error =
                'WinGet exited with code 0, but the package still appears in installed packages.';
              task.logs.push({
                timestamp: new Date().toLocaleTimeString(),
                level: 'error',
                stream: 'status',
                message: task.error,
              });
              return;
            }
            storage.updatePackage(
              pkg.id,
              {
                isInstalled: false,
                installedVersion: undefined,
                installedDate: undefined,
              },
              pkg.source
            );
          } else {
            if (!verification.installed) {
              task.status = 'failed';
              task.phase = 'failed';
              task.operationStatus = 'failed';
              task.statusMessage = 'Verification failed';
              task.error =
                'WinGet exited with code 0, but post-install verification did not find the package installed.';
              task.logs.push({
                timestamp: new Date().toLocaleTimeString(),
                level: 'error',
                stream: 'status',
                message: task.error,
              });
              return;
            }
            const verifiedVersion =
              verification.version || task.targetVersion || pkg.latestVersion;
            task.verifiedInstalledVersion = verifiedVersion;
            storage.updatePackage(
              pkg.id,
              {
                isInstalled: true,
                installedVersion: verifiedVersion,
                installedDate: new Date().toISOString().split('T')[0],
              },
              pkg.source
            );
          }
        } else {
          if (task.action === 'uninstall') {
            storage.updatePackage(
              pkg.id,
              {
                isInstalled: false,
                installedVersion: undefined,
                installedDate: undefined,
              },
              pkg.source
            );
          } else {
            storage.updatePackage(
              pkg.id,
              {
                isInstalled: true,
                installedVersion: task.targetVersion || pkg.latestVersion,
                installedDate: new Date().toISOString().split('T')[0],
              },
              pkg.source
            );
          }
        }

        task.status = 'completed';
        task.phase = 'completed';
        task.operationStatus = 'completed';
        task.progress = 100;
        task.statusMessage = 'Completed successfully';
      } else {
        const endedAt = Date.now();
        task.status = 'failed';
        task.phase = 'failed';
        task.operationStatus = 'failed';
        task.endedAt = endedAt;
        task.endTime = endedAt;
        task.isIndeterminate = false;
        task.statusMessage = 'Operation failed';
        task.error = result.error || 'WinGet execution failed';
      }
    } catch (e) {
      if (!isTerminalPhase(task.status)) {
        const endedAt = Date.now();
        task.status = 'failed';
        task.phase = 'failed';
        task.operationStatus = 'failed';
        task.endedAt = endedAt;
        task.endTime = endedAt;
        task.isIndeterminate = false;
        task.statusMessage = 'Execution exception';
        task.error = (e as Error).message;
        task.exitCode = -1;
      }
    } finally {
      storage.addHistoryTask(task);
      this.activeTasks.delete(task.id);
      this.cancelFlags.delete(task.id);
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
