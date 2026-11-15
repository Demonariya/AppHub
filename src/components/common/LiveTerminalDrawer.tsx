import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Terminal,
  X,
  Copy,
  Check,
  Download,
  Maximize2,
  Minimize2,
  ArrowDown,
  Pause,
} from 'lucide-react';
import { InstallationTask, TaskLogEntry } from '../../types';
import {
  TerminalProgressHeader,
  formatExitCode,
  formatPhaseLabel,
} from '../operations';
import { isTerminalPhase } from '../../services/installationQueue';

interface LiveTerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTask: InstallationTask | null;
  activeTasks?: InstallationTask[];
  queue?: InstallationTask[];
  historyTasks: InstallationTask[];
  inspectedTaskId?: string | null;
  onCancelTask?: (taskId: string) => void;
}

const MAX_RENDERED_LINES = 400;

export const LiveTerminalDrawer: React.FC<LiveTerminalDrawerProps> = ({
  isOpen,
  onClose,
  activeTask,
  activeTasks,
  queue = [],
  historyTasks,
  inspectedTaskId = null,
  onCancelTask,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runningList = useMemo(() => {
    if (activeTasks && activeTasks.length > 0) return activeTasks;
    return activeTask ? [activeTask] : [];
  }, [activeTasks, activeTask]);

  const allTasks = useMemo(() => {
    const byId = new Map<string, InstallationTask>();
    for (const t of runningList) byId.set(t.id, t);
    for (const t of queue) if (!byId.has(t.id)) byId.set(t.id, t);
    for (const t of historyTasks) if (!byId.has(t.id)) byId.set(t.id, t);
    return Array.from(byId.values());
  }, [runningList, queue, historyTasks]);

  useEffect(() => {
    if (inspectedTaskId) {
      setSelectedTaskId(inspectedTaskId);
      setAutoScroll(true);
    } else if (runningList.length > 0) {
      setSelectedTaskId(prev =>
        prev && runningList.some(t => t.id === prev) ? prev : runningList[0].id
      );
      setAutoScroll(true);
    }
  }, [inspectedTaskId, runningList]);

  const displayedTask = useMemo(() => {
    if (selectedTaskId) {
      const found = allTasks.find(t => t.id === selectedTaskId);
      if (found) return found;
    }
    return runningList[0] || queue[0] || historyTasks[0] || null;
  }, [selectedTaskId, allTasks, runningList, queue, historyTasks]);

  useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayedTask?.logs.length, displayedTask?.id, autoScroll]);

  if (!isOpen) return null;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom > 36 && autoScroll) {
      setAutoScroll(false);
    } else if (distanceFromBottom <= 16 && !autoScroll) {
      setAutoScroll(true);
    }
  };

  const scrollToBottom = () => {
    setAutoScroll(true);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const serializeFullLogs = (task: InstallationTask): string => {
    return task.logs
      .map(
        l =>
          `[${l.timestamp}] [${(l.stream || 'stdout').toUpperCase()}] [${l.level.toUpperCase()}] ${l.message}`
      )
      .join('\n');
  };

  const handleCopyLogs = () => {
    if (!displayedTask) return;
    navigator.clipboard?.writeText(serializeFullLogs(displayedTask));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLogs = () => {
    if (!displayedTask) return;
    const raw = serializeFullLogs(displayedTask);
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `winget_${displayedTask.packageId}_${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalLogs = displayedTask?.logs.length || 0;
  const hiddenLinesCount = Math.max(0, totalLogs - MAX_RENDERED_LINES);
  const visibleLogs =
    displayedTask && hiddenLinesCount > 0
      ? displayedTask.logs.slice(-MAX_RENDERED_LINES)
      : displayedTask?.logs || [];

  const isDisplayedTaskCancellable =
    displayedTask && !isTerminalPhase(displayedTask.phase || displayedTask.status);

  return (
    <div
      className={`fixed bottom-0 right-0 z-40 bg-[var(--surface-panel)] border-t border-l border-[var(--border-strong)] shadow-[var(--shadow-dialog)] transition-all duration-200 flex flex-col font-mono ${
        isExpanded
          ? 'top-[var(--titlebar-h,36px)] left-0 md:left-[var(--sidebar-width,224px)]'
          : 'w-full sm:w-[640px] h-[440px]'
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface-shell)] border-b border-[var(--border-subtle)] text-xs select-none gap-2">
        <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium min-w-0">
          <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">WinGet CLI Process Stream</span>
          {runningList.length > 0 && (
            <span className="text-[11px] font-mono text-[var(--accent-primary)] bg-[var(--accent-soft)] border border-[var(--accent-border)] px-1.5 py-0.5 rounded-[5px] tabular-nums shrink-0">
              {runningList.length} running
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={displayedTask?.id || ''}
            onChange={e => {
              setSelectedTaskId(e.target.value);
              setAutoScroll(true);
            }}
            aria-label="Select task log stream"
            className="text-[11px] bg-[var(--surface-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-[6px] px-2 py-1 max-w-[190px] truncate focus:outline-none cursor-pointer"
          >
            {runningList.map(t => (
              <option key={t.id} value={t.id}>
                Active: {t.packageName} ({formatPhaseLabel(t.phase || t.status)})
              </option>
            ))}
            {queue.map(t => (
              <option key={t.id} value={t.id}>
                Queued: {t.packageName}
              </option>
            ))}
            {historyTasks
              .filter(h => !runningList.some(r => r.id === h.id) && !queue.some(q => q.id === h.id))
              .map(t => (
                <option key={t.id} value={t.id}>
                  {t.action.toUpperCase()} {t.packageName} ({formatPhaseLabel(t.phase || t.status)})
                </option>
              ))}
          </select>

          {isDisplayedTaskCancellable && onCancelTask && (
            <button
              type="button"
              onClick={() => onCancelTask(displayedTask.id)}
              title="Cancel selected operation"
              className="px-2 py-1 text-[11px] font-sans font-medium text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] hover:opacity-90 rounded-[6px] transition-opacity cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyLogs}
            aria-label="Copy full logs to clipboard"
            title="Copy full logs to clipboard"
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[var(--status-success-fg)]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleExportLogs}
            aria-label="Export full log file"
            title="Export full log file"
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? 'Restore console size' : 'Maximize console'}
            title={isExpanded ? 'Restore window size' : 'Maximize log window'}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors cursor-pointer"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close CLI console"
            title="Close log viewer"
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--surface-hover)] rounded-[6px] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Multi-active selector strip when >1 active task is running */}
      {runningList.length > 1 && (
        <div className="px-4 py-1.5 bg-[var(--surface-shell)] border-b border-[var(--border-subtle)] flex items-center gap-1.5 overflow-x-auto">
          {runningList.map(t => {
            const active = displayedTask?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSelectedTaskId(t.id);
                  setAutoScroll(true);
                }}
                className={`px-2 py-0.5 rounded-[5px] text-[11px] font-sans whitespace-nowrap border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border-[var(--accent-border)] font-semibold'
                    : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                }`}
              >
                {t.packageName} · {t.isIndeterminate ? formatPhaseLabel(t.phase || t.status) : `${t.progress}%`}
              </button>
            );
          })}
        </div>
      )}

      {/* Canonical Progress Header synced with Queue & Operations */}
      {displayedTask && <TerminalProgressHeader task={displayedTask} />}

      {/* Terminal Output Body (Always crisp high-contrast dark terminal surface) */}
      <div className="flex-1 relative min-h-0 flex flex-col">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 p-4 overflow-y-auto bg-[#07090d] text-xs space-y-1 font-mono leading-relaxed select-text"
        >
          {hiddenLinesCount > 0 && (
            <div className="mb-2 px-2.5 py-1.5 rounded-[6px] bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400">
              Showing last {MAX_RENDERED_LINES} of {totalLogs} lines. Use Copy or Export for the complete log buffer.
            </div>
          )}

          {displayedTask && visibleLogs.length > 0 ? (
            visibleLogs.map((log: TaskLogEntry, idx: number) => {
              const stream = log.stream || (log.level === 'error' ? 'stderr' : 'stdout');
              const colorClass =
                log.level === 'error' || stream === 'stderr'
                  ? 'text-red-400 font-medium'
                  : log.level === 'warn'
                  ? 'text-amber-300'
                  : log.level === 'success'
                  ? 'text-emerald-400'
                  : stream === 'status'
                  ? 'text-sky-300'
                  : 'text-slate-200';

              const streamBadgeClass =
                stream === 'stderr'
                  ? 'text-red-400/90'
                  : stream === 'status'
                  ? 'text-sky-400/80'
                  : 'text-slate-500';

              return (
                <div key={`${hiddenLinesCount + idx}`} className="flex items-start gap-2">
                  <span className="text-slate-500 text-[10px] select-none shrink-0 tabular-nums">
                    [{log.timestamp}]
                  </span>
                  <span className={`${streamBadgeClass} text-[10px] uppercase select-none shrink-0 w-11`}>
                    {stream}
                  </span>
                  <span className={`break-words min-w-0 flex-1 ${colorClass}`}>
                    {log.message}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="py-10 text-center text-slate-500 text-xs">
              No WinGet execution logs recorded for this task.
            </div>
          )}
        </div>

        {!autoScroll && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-3 right-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] bg-[var(--surface-elevated)] border border-[var(--border-strong)] text-[11px] font-sans font-medium text-[var(--text-primary)] shadow-[var(--shadow-card)] hover:bg-[var(--surface-hover)] cursor-pointer"
          >
            <ArrowDown className="w-3 h-3 text-[var(--accent-primary)]" />
            <span>Resume Auto-Scroll</span>
          </button>
        )}
      </div>

      {/* Bottom Status Strip */}
      {displayedTask && (
        <div className="px-4 py-2 bg-[var(--surface-shell)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-secondary)] gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <span className="truncate">
              Phase:{' '}
              <strong className="text-[var(--text-primary)]">
                {formatPhaseLabel(displayedTask.phase || displayedTask.status)}
              </strong>
            </span>
            {!autoScroll && (
              <span className="inline-flex items-center gap-1 text-[var(--status-warning-fg)]">
                <Pause className="w-3 h-3" />
                <span>Scroll paused</span>
              </span>
            )}
          </div>
          <span className="tabular-nums shrink-0">
            Exit Code: {formatExitCode(displayedTask.exitCode) || (isDisplayedTaskCancellable ? 'Running' : '—')}
          </span>
        </div>
      )}
    </div>
  );
};
