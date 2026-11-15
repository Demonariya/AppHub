import React from 'react';
import { InstallationTask, Package } from '../../types';
import { formatDurationMs, formatExitCode } from './OperationStatus';

interface OperationSummaryProps {
  task: InstallationTask;
  pkg?: Package;
  nowMs?: number;
}

export const OperationSummary: React.FC<OperationSummaryProps> = ({
  task,
  pkg,
  nowMs,
}) => {
  const sizeLabel =
    task.action !== 'uninstall'
      ? pkg?.formattedDownloadSize || pkg?.formattedSize
      : undefined;
  const elapsed = formatDurationMs(task.startedAt ?? task.startTime, task.endedAt ?? task.endTime ?? nowMs);
  const exitLabel = formatExitCode(task.exitCode);

  const parts: string[] = [
    task.packageId,
    `v${task.verifiedInstalledVersion || task.targetVersion || task.version}`,
  ];
  if (sizeLabel) parts.push(sizeLabel);
  if (elapsed) parts.push(elapsed);
  if (exitLabel) parts.push(exitLabel);

  return (
    <div className="text-[11px] text-[var(--text-muted)] font-mono flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
      {parts.map((part, idx) => (
        <React.Fragment key={`${part}-${idx}`}>
          {idx > 0 && <span aria-hidden="true">·</span>}
          <span className={idx === 2 && sizeLabel ? 'text-[var(--text-secondary)]' : undefined}>
            {part}
          </span>
        </React.Fragment>
      ))}
      {task.flags.customLocation && (
        <>
          <span aria-hidden="true">·</span>
          <span className="truncate max-w-xs text-[var(--text-secondary)]">
            {task.flags.customLocation}
          </span>
        </>
      )}
    </div>
  );
};
