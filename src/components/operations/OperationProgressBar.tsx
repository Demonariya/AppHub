import React from 'react';
import { OperationPhase } from '../../types';
import { formatByteRatio, formatPhaseLabel } from './OperationStatus';

interface OperationProgressBarProps {
  phase: OperationPhase;
  progress: number;
  isIndeterminate?: boolean;
  bytesDownloaded?: number;
  totalBytes?: number;
  downloadSpeed?: string;
  statusMessage?: string;
  compact?: boolean;
}

export const OperationProgressBar: React.FC<OperationProgressBarProps> = ({
  phase,
  progress,
  isIndeterminate,
  bytesDownloaded,
  totalBytes,
  downloadSpeed,
  statusMessage,
  compact = false,
}) => {
  const isTerminal = phase === 'completed' || phase === 'failed' || phase === 'cancelled';
  const showIndeterminate =
    !isTerminal && (Boolean(isIndeterminate) || (progress === 0 && phase !== 'queued'));
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const byteRatio = formatByteRatio(bytesDownloaded, totalBytes);

  const barColor =
    phase === 'failed'
      ? 'bg-[var(--status-danger-fg)]'
      : phase === 'cancelled'
      ? 'bg-[var(--status-warning-fg)]'
      : phase === 'completed'
      ? 'bg-[var(--status-success-fg)]'
      : 'bg-[var(--accent-primary)]';

  const metrics: string[] = [];
  if (!showIndeterminate && (clamped > 0 || phase === 'completed')) {
    metrics.push(`${clamped}%`);
  }
  if (byteRatio) {
    metrics.push(byteRatio);
  }
  if (downloadSpeed && !isTerminal) {
    metrics.push(downloadSpeed);
  }

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex items-center justify-between gap-3 text-xs font-mono text-[var(--text-secondary)]">
        <span className="truncate text-[var(--text-secondary)]">
          {statusMessage || `${formatPhaseLabel(phase)}${isTerminal ? '' : '...'}`}
        </span>
        <span className="tabular-nums shrink-0 text-[var(--text-primary)]">
          {metrics.length > 0 ? metrics.join(' · ') : showIndeterminate ? 'In progress' : formatPhaseLabel(phase)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={showIndeterminate ? undefined : clamped}
        className="w-full h-1.5 rounded-full bg-[var(--surface-active)] overflow-hidden"
      >
        {showIndeterminate ? (
          <div className={`h-full rounded-full animate-indeterminate ${barColor}`} />
        ) : (
          <div
            className={`h-full transition-all duration-300 rounded-full ${barColor}`}
            style={{ width: `${clamped > 0 ? Math.max(clamped, 2) : 0}%` }}
          />
        )}
      </div>
    </div>
  );
};
