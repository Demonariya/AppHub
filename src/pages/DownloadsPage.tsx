import React from 'react';
import { InstallationTask, TaskStatus } from '../types';
import {
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  X,
  Terminal,
  Trash2,
  AlertTriangle,
  Play,
  Pause,
} from 'lucide-react';

interface DownloadsPageProps {
  queue: InstallationTask[];
  activeTask: InstallationTask | null;
  historyTasks: InstallationTask[];
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onClearHistory: () => void;
  onOpenTerminalForTask: (task: InstallationTask) => void;
}

export const DownloadsPage: React.FC<DownloadsPageProps> = ({
  queue,
  activeTask,
  historyTasks,
  onCancelTask,
  onRetryTask,
  onClearHistory,
  onOpenTerminalForTask,
}) => {
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Installation Queue & History</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Real-time WinGet task runner with sequential process execution and live telemetry.
          </p>
        </div>

        {historyTasks.length > 0 && (
          <button
            onClick={onClearHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-red-400 hover:bg-neutral-900 border border-neutral-800 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {/* Active Running Task Banner */}
      {activeTask && (
        <div className="p-5 rounded-2xl bg-gradient-to-r from-sky-950/40 via-neutral-900 to-neutral-900 border border-sky-800/50 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <Download className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-neutral-100">
                    {activeTask.packageName}
                  </span>
                  <span className="text-xs font-mono text-sky-400 uppercase">
                    [{activeTask.action}]
                  </span>
                </div>
                <div className="text-xs text-neutral-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                  <span>Package ID: {activeTask.packageId}</span>
                  <span className="text-neutral-600">·</span>
                  <span>Target: v{activeTask.targetVersion}</span>
                  <span className="text-neutral-600">·</span>
                  <span className="text-neutral-300">Target Volume: C:\ (NTFS)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenTerminalForTask(activeTask)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span>View Console</span>
              </button>

              <button
                onClick={() => onCancelTask(activeTask.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors"
              >
                <X className="w-3.5 h-3.5 text-red-400" />
                <span>Cancel</span>
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
              <span className="capitalize">{activeTask.status}...</span>
              <span className="tabular-nums">
                {activeTask.progress}% {activeTask.downloadSpeed ? `(@ ${activeTask.downloadSpeed})` : ''}
              </span>
            </div>
            <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(activeTask.progress, 5)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Queued Tasks (Waiting) */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-400" />
          <span>Pending in Queue ({queue.length})</span>
        </h2>

        {queue.length > 0 ? (
          <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800 bg-neutral-950/40">
            {queue.map((task, index) => (
              <div
                key={task.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-neutral-900/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-neutral-500 w-5">#{index + 1}</span>
                  <div>
                    <div className="text-xs font-medium text-neutral-200">
                      {task.packageName} <span className="text-neutral-500 font-mono text-[11px] uppercase">({task.action})</span>
                    </div>
                    <div className="text-[11px] font-mono text-neutral-400">
                      {task.packageId} · Target: v{task.targetVersion}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-neutral-500">Queued</span>
                  <button
                    onClick={() => onCancelTask(task.id)}
                    className="p-1 text-neutral-500 hover:text-red-400 rounded transition-colors"
                    title="Remove from queue"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-400 border border-neutral-800/60 rounded-xl bg-neutral-900/20">
            No pending installations in queue.
          </div>
        )}
      </section>

      {/* Installation History */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Completed & Past Operations ({historyTasks.length})</span>
        </h2>

        {historyTasks.length > 0 ? (
          <div className="rounded-xl border border-neutral-800 divide-y divide-neutral-800 bg-neutral-950/40">
            {historyTasks.map(task => {
              const isSuccess = task.status === 'completed';
              const isCancelled = task.status === 'cancelled';
              const isFailed = task.status === 'failed';

              return (
                <div
                  key={task.id}
                  className="p-3.5 flex items-center justify-between gap-4 hover:bg-neutral-900/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                      {isSuccess ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isCancelled ? (
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-neutral-200 truncate">
                          {task.packageName}
                        </span>
                        <span className="text-[10px] font-mono uppercase text-neutral-500">
                          [{task.action}]
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-neutral-400 flex items-center gap-2 mt-0.5 truncate">
                        <span>{task.packageId}</span>
                        <span className="text-neutral-600">·</span>
                        <span>{new Date(task.startTime).toLocaleTimeString()}</span>
                        {task.error && (
                          <>
                            <span className="text-neutral-600">·</span>
                            <span className="text-red-400 truncate">{task.error}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => onOpenTerminalForTask(task)}
                      title="Inspect WinGet Process Logs"
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded transition-colors"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>Logs</span>
                    </button>

                    {isFailed && (
                      <button
                        onClick={() => onRetryTask(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-sky-400 hover:text-sky-300 bg-sky-950/40 border border-sky-800/40 rounded transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-neutral-400 border border-neutral-800/60 rounded-xl bg-neutral-900/20">
            No installation history recorded yet.
          </div>
        )}
      </section>
    </div>
  );
};
