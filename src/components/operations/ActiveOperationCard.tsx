import React, { useEffect, useState } from 'react';
import { Terminal, X } from 'lucide-react';
import { InstallationTask, OperationPhase, Package } from '../../types';
import { AppIcon } from '../icons';
import { Button } from '../ui/Button';
import { OperationStatus } from './OperationStatus';
import { OperationProgressBar } from './OperationProgressBar';
import { OperationSummary } from './OperationSummary';

interface ActiveOperationCardProps {
  task: InstallationTask;
  pkg: Package;
  onInspectConsole: (task: InstallationTask) => void;
  onCancel: (taskId: string) => void;
}

export const ActiveOperationCard: React.FC<ActiveOperationCardProps> = ({
  task,
  pkg,
  onInspectConsole,
  onCancel,
}) => {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [task.id]);

  const phase = (task.phase || task.status) as OperationPhase;

  const handleCancelClick = () => {
    setIsCancelling(true);
    onCancel(task.id);
  };

  return (
    <div className="p-5 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--accent-border)] shadow-[var(--shadow-card)] space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <AppIcon pkg={pkg} size="md" />
          <div className="min-w-0 space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm text-[var(--text-primary)] truncate">
                {task.packageName}
              </span>
              <span className="text-[11px] font-mono uppercase text-[var(--text-muted)]">
                {task.action}
              </span>
              <OperationStatus phase={phase} compact />
            </div>
            <OperationSummary task={task} pkg={pkg} nowMs={nowMs} />
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
            onClick={() => onInspectConsole(task)}
          >
            Inspect Console
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={isCancelling}
            leftIcon={<X className="w-3.5 h-3.5" />}
            onClick={handleCancelClick}
          >
            {isCancelling ? 'Cancelling...' : 'Cancel'}
          </Button>
        </div>
      </div>

      <OperationProgressBar
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
