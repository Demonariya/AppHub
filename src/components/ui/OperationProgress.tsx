import React from 'react';
import { TaskStatus } from '../../types';

interface OperationProgressProps {
  status: TaskStatus;
  progress: number;
  isIndeterminate?: boolean;
  downloadSpeed?: string;
}

export const OperationProgress: React.FC<OperationProgressProps> = ({
  status,
  progress,
  isIndeterminate,
  downloadSpeed,
}) => {
  const showIndeterminate = Boolean(isIndeterminate && progress === 0);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-mono text-[var(--text-secondary)]">
        <span className="capitalize">{status}...</span>
        <span className="tabular-nums">
          {showIndeterminate
            ? 'Running via WinGet...'
            : `${progress}%${downloadSpeed ? ` · ${downloadSpeed}` : ''}`}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={showIndeterminate ? undefined : progress}
        className="w-full h-1.5 rounded-full bg-[var(--surface-active)] overflow-hidden"
      >
        {showIndeterminate ? (
          <div className="h-full bg-[var(--accent-primary)] rounded-full animate-indeterminate" />
        ) : (
          <div
            className="h-full bg-[var(--accent-primary)] transition-all duration-300 rounded-full"
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        )}
      </div>
    </div>
  );
};
