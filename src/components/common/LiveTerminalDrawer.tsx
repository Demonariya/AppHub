import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, Copy, Check, Download, Trash2, Maximize2, Minimize2 } from 'lucide-react';
import { InstallationTask, TaskLogEntry } from '../../types';

interface LiveTerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTask: InstallationTask | null;
  historyTasks: InstallationTask[];
}

export const LiveTerminalDrawer: React.FC<LiveTerminalDrawerProps> = ({
  isOpen,
  onClose,
  activeTask,
  historyTasks,
}) => {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('active');
  const scrollRef = useRef<HTMLDivElement>(null);

  const displayedTask =
    selectedTaskId === 'active'
      ? activeTask || historyTasks[0] || null
      : historyTasks.find(t => t.id === selectedTaskId) || null;

  useEffect(() => {
    if (activeTask) {
      setSelectedTaskId('active');
    }
  }, [activeTask?.id]);

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
    navigator.clipboard.writeText(raw);
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

  return (
    <div
      className={`fixed bottom-0 right-0 z-40 bg-neutral-950 border-t border-l border-neutral-800 shadow-2xl transition-all duration-200 flex flex-col font-mono ${
        isExpanded
          ? 'top-9 left-0 sm:left-56'
          : 'w-full sm:w-[580px] h-96'
      }`}
    >
      {/* Title & Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-900 border-b border-neutral-800 text-xs select-none">
        <div className="flex items-center gap-2 text-neutral-300 font-medium">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          <span>WinGet CLI Process Stream</span>
          {activeTask && (
            <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold animate-pulse">
              ● Running: {activeTask.packageName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Task selector dropdown */}
          <select
            value={selectedTaskId}
            onChange={e => setSelectedTaskId(e.target.value)}
            className="text-[11px] bg-neutral-950 border border-neutral-700 text-neutral-300 rounded px-2 py-0.5 max-w-[150px] truncate focus:outline-none"
          >
            {activeTask && <option value="active">Active: {activeTask.packageName}</option>}
            {historyTasks.map(t => (
              <option key={t.id} value={t.id}>
                {t.action.toUpperCase()} {t.packageName} ({t.status})
              </option>
            ))}
          </select>

          <button
            onClick={handleCopyLogs}
            title="Copy logs to clipboard"
            className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={handleExportLogs}
            title="Export log file"
            className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Restore window size' : 'Maximize log window'}
            className="p-1 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded transition-colors"
          >
            {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            title="Close log viewer"
            className="p-1 text-neutral-400 hover:text-red-400 hover:bg-neutral-800 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Body */}
      <div
        ref={scrollRef}
        className="flex-1 p-3.5 overflow-y-auto bg-black text-xs space-y-1 font-mono leading-relaxed select-text"
      >
        {displayedTask && displayedTask.logs.length > 0 ? (
          displayedTask.logs.map((log: TaskLogEntry, idx: number) => {
            const colorClass =
              log.level === 'error'
                ? 'text-red-400 font-semibold'
                : log.level === 'warn'
                ? 'text-amber-400'
                : log.level === 'success'
                ? 'text-emerald-400'
                : 'text-neutral-300';

            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-neutral-600 text-[10px] select-none shrink-0">
                  [{log.timestamp}]
                </span>
                <span className={`break-all ${colorClass}`}>{log.message}</span>
              </div>
            );
          })
        ) : (
          <div className="py-8 text-center text-neutral-600 text-xs">
            No active WinGet execution logs. Start an installation or update to stream live console output.
          </div>
        )}
      </div>

      {/* Bottom Status strip */}
      {displayedTask && (
        <div className="px-4 py-1.5 bg-neutral-900 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <div className="flex items-center gap-3">
            <span>Status: <strong className="text-neutral-200 uppercase">{displayedTask.status}</strong></span>
            {displayedTask.progress > 0 && (
              <span>Progress: <strong className="text-sky-400">{displayedTask.progress}%</strong></span>
            )}
            {displayedTask.downloadSpeed && (
              <span>Speed: <strong className="text-neutral-300">{displayedTask.downloadSpeed}</strong></span>
            )}
          </div>
          <span className="text-neutral-500">Exit Code: {displayedTask.status === 'failed' ? '0x80070005' : '0x00000000'}</span>
        </div>
      )}
    </div>
  );
};
