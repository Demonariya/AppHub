import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Copy, Check, Download, Maximize2, Minimize2 } from 'lucide-react';
import { InstallationTask, TaskLogEntry } from '../../types';
import { StatusBadge } from '../ui';

interface LiveTerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTask: InstallationTask | null;
  historyTasks: InstallationTask[];
  inspectedTaskId?: string | null;
}

export const LiveTerminalDrawer: React.FC<LiveTerminalDrawerProps> = ({
  isOpen,
  onClose,
  activeTask,
  historyTasks,
  inspectedTaskId = null,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('active');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inspectedTaskId) {
      setSelectedTaskId(inspectedTaskId);
    } else if (activeTask) {
      setSelectedTaskId('active');
    }
  }, [inspectedTaskId, activeTask?.id]);

  const displayedTask =
    selectedTaskId === 'active'
      ? activeTask || historyTasks[0] || null
      : activeTask?.id === selectedTaskId
      ? activeTask
      : historyTasks.find(t => t.id === selectedTaskId) || null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedTask?.logs.length]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    if (!displayedTask) return;
    const raw = displayedTask.logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    navigator.clipboard?.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportLogs = () => {
    if (!displayedTask) return;
    const raw = displayedTask.logs
      .map(l => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n');
    const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `winget_${displayedTask.packageId}_${Date.now()}.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatExitCode = (task: InstallationTask): string => {
    if (task.exitCode !== undefined && task.exitCode !== null) {
      if (task.exitCode === 0) return '0 (Success)';
      const hex = `0x${(task.exitCode >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
      return `${hex} (${task.exitCode})`;
    }
    if (task.status === 'completed') return '0 (Success)';
    if (task.status === 'cancelled') return 'Cancelled';
    if (task.status === 'failed') return 'Non-zero (see log)';
    return 'Running';
  };

  return (
    <div
      className={`fixed bottom-0 right-0 z-40 bg-[var(--surface-panel)] border-t border-l border-[var(--border-strong)] shadow-[var(--shadow-dialog)] transition-all duration-200 flex flex-col font-mono ${
        isExpanded ? 'top-9 left-0 md:left-56' : 'w-full sm:w-[600px] h-96'
      }`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--surface-shell)] border-b border-[var(--border-subtle)] text-xs select-none gap-2">
        <div className="flex items-center gap-2 text-[var(--text-primary)] font-medium min-w-0">
          <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
          <span className="truncate">WinGet CLI Process Stream</span>
          {activeTask && <StatusBadge status="running" label={activeTask.packageName} compact />}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={selectedTaskId}
            onChange={e => setSelectedTaskId(e.target.value)}
            aria-label="Select task log stream"
            className="text-[11px] bg-[var(--surface-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-[6px] px-2 py-1 max-w-[160px] truncate focus:outline-none cursor-pointer"
          >
            {activeTask && <option value="active">Active: {activeTask.packageName}</option>}
            {historyTasks.map(t => (
              <option key={t.id} value={t.id}>
                {t.action.toUpperCase()} {t.packageName} ({t.status})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleCopyLogs}
            aria-label="Copy logs to clipboard"
            title="Copy logs to clipboard"
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
            aria-label="Export log file"
            title="Export log file"
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

      {/* Terminal Output Body (Always crisp high-contrast dark terminal surface) */}
      <div
        ref={scrollRef}
        className="flex-1 p-3.5 overflow-y-auto bg-[#07090d] text-xs space-y-1 font-mono leading-relaxed select-text"
      >
        {displayedTask && displayedTask.logs.length > 0 ? (
          displayedTask.logs.map((log: TaskLogEntry, idx: number) => {
            const colorClass =
              log.level === 'error'
                ? 'text-red-400 font-semibold'
                : log.level === 'warn'
                ? 'text-amber-300'
                : log.level === 'success'
                ? 'text-emerald-400'
                : 'text-slate-300';

            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-slate-500 text-[10px] select-none shrink-0">
                  [{log.timestamp}]
                </span>
                <span className={`break-all ${colorClass}`}>{log.message}</span>
              </div>
            );
          })
        ) : (
          <div className="py-10 text-center text-slate-500 text-xs">
            No WinGet execution logs recorded for this task.
          </div>
        )}
      </div>

      {/* Bottom Status Strip */}
      {displayedTask && (
        <div className="px-4 py-2 bg-[var(--surface-shell)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-3">
            <span>
              Status:{' '}
              <strong className="text-[var(--text-primary)] uppercase">{displayedTask.status}</strong>
            </span>
            {displayedTask.isIndeterminate && displayedTask.progress === 0 ? (
              <span>
                Progress: <strong className="text-[var(--accent-primary)]">In progress</strong>
              </span>
            ) : displayedTask.progress > 0 ? (
              <span>
                Progress:{' '}
                <strong className="text-[var(--accent-primary)] tabular-nums">
                  {displayedTask.progress}%
                </strong>
              </span>
            ) : null}
            {displayedTask.downloadSpeed && (
              <span>
                Speed:{' '}
                <strong className="text-[var(--text-primary)]">{displayedTask.downloadSpeed}</strong>
              </span>
            )}
          </div>
          <span>Exit Code: {formatExitCode(displayedTask)}</span>
        </div>
      )}
    </div>
  );
};
