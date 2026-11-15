import React, { useState, useMemo } from 'react';
import { InstallationTask, Package } from '../types';
import {
  Activity,
  Clock,
  RotateCw,
  X,
  Terminal,
  Trash2,
} from 'lucide-react';
import { AppIconImage } from '../components/common/AppIconImage';
import {
  PageHeader,
  SegmentedTabs,
  StatusBadge,
  OperationProgress,
  Button,
  EmptyState,
  ConfirmationDialog,
} from '../components/ui';

interface DownloadsPageProps {
  packages?: Package[];
  queue: InstallationTask[];
  activeTask: InstallationTask | null;
  activeTasks?: InstallationTask[];
  historyTasks: InstallationTask[];
  onCancelTask: (taskId: string) => void;
  onRetryTask: (taskId: string) => void;
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
  onClearHistory,
  onOpenTerminalForTask,
}) => {
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const runningTasks =
    activeTasks && activeTasks.length > 0 ? activeTasks : activeTask ? [activeTask] : [];

  const packageById = useMemo(() => {
    const map = new Map<string, Package>();
    for (const p of packages) {
      map.set(p.id.toLowerCase(), p);
    }
    return map;
  }, [packages]);

  const resolveTaskPkg = (task: InstallationTask): Package => {
    const known = packageById.get(task.packageId.toLowerCase());
    if (known) return known;
    return {
      id: task.packageId,
      name: task.packageName,
      publisher: task.packageId.split('.')[0] || 'WinGet',
      version: task.version,
      latestVersion: task.targetVersion || task.version,
      description: '',
      category: 'Utilities',
      tags: [],
      source: 'winget',
      architectures: ['x64'],
      license: '',
      homepage: '',
      releaseDate: '',
      verified: true,
    };
  };

  const formatExitCode = (code?: number) => {
    if (code === undefined || code === null) return null;
    if (code === 0) return 'Exit 0';
    if (code < 0 || code > 255) {
      return `0x${(code >>> 0).toString(16).toUpperCase()}`;
    }
    return `Exit ${code}`;
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
                <div
                  key={task.id}
                  className="p-5 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--accent-border)] shadow-[var(--shadow-card)] space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <AppIconImage pkg={resolveTaskPkg(task)} size="md" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                            {task.packageName}
                          </span>
                          <StatusBadge status="running" label={task.action.toUpperCase()} compact />
                        </div>
                        <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{task.packageId}</span>
                          <span>·</span>
                          <span>v{task.targetVersion || task.version}</span>
                          {task.flags.customLocation && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-xs text-[var(--text-secondary)]">
                                {task.flags.customLocation}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                        onClick={() => onOpenTerminalForTask(task)}
                      >
                        Inspect Console
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        leftIcon={<X className="w-3.5 h-3.5" />}
                        onClick={() => onCancelTask(task.id)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>

                  <OperationProgress
                    status={task.status}
                    progress={task.progress}
                    isIndeterminate={task.isIndeterminate}
                    downloadSpeed={task.downloadSpeed}
                  />
                </div>
              ))}
            </section>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>Pending Queue ({queue.length})</span>
            </h2>

            {queue.length > 0 ? (
              <div className="rounded-[12px] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--surface-panel)]">
                {queue.map((task, index) => (
                  <div
                    key={task.id}
                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-[var(--text-muted)] w-6 tabular-nums">
                        #{index + 1}
                      </span>
                      <AppIconImage pkg={resolveTaskPkg(task)} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {task.packageName}{' '}
                          <span className="text-[var(--text-muted)] font-mono text-[11px] uppercase font-normal">
                            · {task.action}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-[var(--text-muted)] truncate">
                          {task.packageId} · v{task.targetVersion || task.version}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status="queued" compact />
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Cancel queued ${task.packageName}`}
                        onClick={() => onCancelTask(task.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
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
                const isFailed = task.status === 'failed';
                const exitLabel = formatExitCode(task.exitCode);
                const durationSec =
                  task.endTime && task.startTime
                    ? `${Math.max(1, Math.round((task.endTime - task.startTime) / 1000))}s`
                    : null;

                const statusKind =
                  task.status === 'completed'
                    ? 'completed'
                    : task.status === 'cancelled'
                    ? 'cancelled'
                    : 'failed';

                return (
                  <div
                    key={task.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/60 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <AppIconImage pkg={resolveTaskPkg(task)} size="sm" />

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {task.packageName}
                          </span>
                          <span className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
                            {task.action}
                          </span>
                          <StatusBadge status={statusKind} compact />
                          {exitLabel && (
                            <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                              {exitLabel}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-mono text-[var(--text-secondary)] flex flex-wrap items-center gap-1.5 mt-1">
                          <span>{task.packageId}</span>
                          <span className="text-[var(--text-muted)]">·</span>
                          <span className="tabular-nums">
                            {new Date(task.startTime).toLocaleTimeString()}
                          </span>
                          {durationSec && (
                            <>
                              <span className="text-[var(--text-muted)]">·</span>
                              <span className="tabular-nums">{durationSec}</span>
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
