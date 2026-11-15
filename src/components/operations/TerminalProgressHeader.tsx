import React, { useEffect, useState } from 'react';
import { InstallationTask } from '../../types';
import { OperationPhase } from '../../types';
import { OperationProgressBar } from './OperationProgressBar';
import { OperationStatus, formatDurationMs, formatExitCode, isTerminalPhaseLabel } from './TerminalProgressHeaderHelpers';

interface TerminalProgressHeaderProps {
  task: InstallationTask;
}

export const TerminalProgressHeader: React.FC<TerminalProgressHeaderProps> = ({ task }) => {
  const phase = (task.phase || task.status) as OperationPhase;
  const isRunning = !isTerminalPhaseLabel(phase) && phase !== 'queued';
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isRunning, task.id]);

  const elapsed = formatDurationMs(
    task.startedAt ?? task.startTime,
    task.endedAt ?? task.endTime ?? (isRunning ? nowMs : undefined)
  );
  const exitLabel = formatExitCode(task.exitCode);

  return (
    <div className="px-4 py-2.5 bg-[var(--surface-subtle)] border-b border-[var(--border-subtle)] space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[var(--text-primary)] truncate">
            {task.packageName}
          </span>
          <span className="text-[11px] font-mono uppercase text-[var(--text-muted)] shrink-0">
            {task.action}
          </span>
          <OperationStatus phase={phase} compact />
        </div>

        <div className="flex items-center gap-2.5 text-[11px] font-mono text-[var(--text-muted)] tabular-nums shrink-0">
          <span>v{task.verifiedInstalledVersion || task.targetVersion || task.version}</span>
          {elapsed && <span>Elapsed {elapsed}</span>}
          {exitLabel && <span className="text-[var(--text-secondary)]">{exitLabel}</span>}
        </div>
      </div>

      <OperationProgressBar
        compact
        phase={phase}
        progress={task.progress}
        isIndeterminate={task.isIndeterminate}
        bytesDownloaded={task.bytesDownloaded}
        totalBytes={task.totalBytes}
        downloadSpeed={task.downloadSpeed}
        statusMessage={task.statusMessage}
      />
    </div>
  );
};
