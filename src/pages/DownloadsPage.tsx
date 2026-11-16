import React, { useState, useMemo } from 'react';
import { InstallationTask, OperationPhase, Package } from '../types';
import {
  Activity,
  Clock,
  RotateCw,
  Terminal,
  Trash2,
} from 'lucide-react';
import { AppIcon } from '../components/icons';
import {
  ActiveOperationCard,
  OperationStatus,
  QueueTaskRow,
  formatDurationMs,
  formatExitCode,
} from '../components/operations';
import {
  PageHeader,
  SegmentedTabs,
  Button,
  EmptyState,
  ConfirmationDialog,
} from '../components/ui';
import { getPackageKey } from '../services/catalog';

interface DownloadsPageProps {
  packages?: Package[];
  queue: InstallationTask[];
  activeTask: InstallationTask | null;
  activeTasks?: InstallationTask[];
  historyTasks: InstallationTask[];
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
  onClearQueue?: () => void;
  onClearHistory: () => void;
  onOpenTerminalForTask: (task: InstallationTask) => void;
}

type ActivityFilter = 'all' | 'active' | 'completed' | 'failed' | 'cancelled';

export const DownloadsPage: React.FC<DownloadsPageProps> = ({
  packages = [],
  queue,
  activeTask,
  activeTasks,
  historyTasks,
  onCancelTask,
  onRetryTask,
  onClearQueue,
  onClearHistory,
  onOpenTerminalForTask,
}) => {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const runningTasks =
    activeTasks && activeTasks.length > 0 ? activeTasks : activeTask ? [activeTask] : [];

  const { packageByKey, packageById } = useMemo(() => {
    const byKey = new Map<string, Package>();
    const byId = new Map<string, Package>();
    for (const p of packages) {
      byKey.set(getPackageKey(p.id, p.source), p);
      const idKey = p.id.toLowerCase();
      const existing = byId.get(idKey);
      if (!existing || (existing.isExternal && !p.isExternal)) {
        byId.set(idKey, p);
      }
    }
    return { packageByKey: byKey, packageById: byId };
  }, [packages]);

  const resolveTaskPkg = (task: InstallationTask): Package => {
    const known =
      (task.source && packageByKey.get(getPackageKey(task.packageId, task.source))) ||
      packageByKey.get(getPackageKey(task.packageId, 'winget')) ||
      packageById.get(task.packageId.toLowerCase());
    if (known) return known;
    return {
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
  };

  const completedTasks = historyTasks.filter(t => t.status === 'completed');
  const failedTasks = historyTasks.filter(t => t.status === 'failed');
  const cancelledTasks = historyTasks.filter(t => t.status === 'cancelled');

  const visibleHistory = useMemo(() => {
    if (filter === 'completed') return completedTasks;
    if (filter === 'failed') return failedTasks;
    if (filter === 'cancelled') return cancelledTasks;
    if (filter === 'active') return [];
    return historyTasks;
  }, [filter, historyTasks, completedTasks, failedTasks, cancelledTasks]);

  const showActiveSection = filter === 'all' || filter === 'active';
  const showHistorySection = filter !== 'active';

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Operations & Queue"
        subtitle="Live WinGet process execution, pending tasks, and persistent SQLite operation history."
        actions={
          historyTasks.length > 0 ? (
            <Button
              size="md"
              variant="danger"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setConfirmClearOpen(true)}
            >
              Clear History
            </Button>
          ) : undefined
        }
      />

      <SegmentedTabs
        value={filter}
        onChange={setFilter}
        ariaLabel="Filter operations by status"
        options={[
          {
            id: 'all',
            label: 'All Activity',
            count: runningTasks.length + queue.length + historyTasks.length,
          },
          {
            id: 'active',
            label: 'Active & Queued',
            count: runningTasks.length + queue.length,
          },
          { id: 'completed', label: 'Completed', count: completedTasks.length },
          { id: 'failed', label: 'Failed', count: failedTasks.length },
          { id: 'cancelled', label: 'Cancelled', count: cancelledTasks.length },
        ]}
      />

      {/* Active & Queued Section */}
      {showActiveSection && (
        <div className="space-y-4">
          {runningTasks.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Currently Executing ({runningTasks.length})
              </h2>
              {runningTasks.map(task => (
                <ActiveOperationCard
                  key={task.id}
                  task={task}
                  pkg={resolveTaskPkg(task)}
                  onInspectConsole={onOpenTerminalForTask}
                  onCancel={onCancelTask}
                />
              ))}
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                <span>Pending Queue ({queue.length})</span>
              </h2>
              {queue.length > 0 && onClearQueue && (
                <Button size="sm" variant="ghost" onClick={onClearQueue}>
                  Clear Queue
                </Button>
              )}
            </div>

            {queue.length > 0 ? (
              <div className="rounded-[12px] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--surface-panel)]">
                {queue.map((task, index) => (
                  <QueueTaskRow
                    key={task.id}
                    task={task}
                    pkg={resolveTaskPkg(task)}
                    position={index + 1}
                    onCancel={onCancelTask}
                  />
                ))}
              </div>
            ) : (
              runningTasks.length === 0 && (
                <EmptyState
                  compact
                  icon={<Activity className="w-5 h-5" />}
                  title="No Active or Queued Operations"
                  description="Installations, upgrades, and uninstalls queued from AppHub will display live progress here."
                />
              )
            )}
          </section>
        </div>
      )}

      {/* Past Operations */}
      {showHistorySection && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Operation History ({visibleHistory.length})
          </h2>

          {visibleHistory.length > 0 ? (
            <div className="rounded-[12px] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--surface-panel)]">
              {visibleHistory.map(task => {
                const phase = (task.phase || task.status) as OperationPhase;
                const isFailed = phase === 'failed';
                const exitLabel = formatExitCode(task.exitCode);
                const queuedAt = task.queuedAt ?? task.startTime;
                const startedAt = task.startedAt ?? task.startTime;
                const endedAt = task.endedAt ?? task.endTime;
                const durationLabel = formatDurationMs(startedAt, endedAt);

                return (
                  <div
                    key={task.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/60 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <AppIcon pkg={resolveTaskPkg(task)} size="sm" />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {task.packageName}
                          </span>
                          <span className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
                            {task.action}
                          </span>
                          <OperationStatus phase={phase} compact />
                          {exitLabel && (
                            <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                              {exitLabel}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-[var(--text-secondary)] flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 tabular-nums">
                          <span>{task.packageId}</span>
                          {task.source && task.source !== 'external' && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span>{task.source}</span>
                            </>
                          )}
                          {queuedAt && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span>Queued {new Date(queuedAt).toLocaleTimeString()}</span>
                            </>
                          )}
                          {task.startedAt && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span>Started {new Date(task.startedAt).toLocaleTimeString()}</span>
                            </>
                          )}
                          {endedAt && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span>Ended {new Date(endedAt).toLocaleTimeString()}</span>
                            </>
                          )}
                          {durationLabel && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span>{durationLabel}</span>
                            </>
                          )}
                        </div>

                        {task.error && (
                          <p className="text-xs text-[var(--status-danger-fg)] mt-1 break-words">
                            {task.error}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                        onClick={() => onOpenTerminalForTask(task)}
                      >
                        Inspect Logs
                      </Button>

                      {isFailed && (
                        <Button
                          size="sm"
                          variant="primary"
                          leftIcon={<RotateCw className="w-3.5 h-3.5" />}
                          onClick={() => onRetryTask(task.id)}
                        >
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              compact
              icon={<Clock className="w-5 h-5" />}
              title="No Recorded Operations"
              description={
                filter === 'all'
                  ? 'Completed, failed, and cancelled WinGet operations will appear here.'
                  : `No ${filter} operations in your history.`
              }
            />
          )}
        </section>
      )}

      <ConfirmationDialog
        isOpen={confirmClearOpen}
        onCancel={() => setConfirmClearOpen(false)}
        onConfirm={() => {
          onClearHistory();
          setConfirmClearOpen(false);
        }}
        title="Clear Operation History"
        description="Remove all completed, failed, and cancelled task records from local SQLite storage."
        confirmLabel="Clear History"
        tone="danger"
      />
    </div>
  );
};
