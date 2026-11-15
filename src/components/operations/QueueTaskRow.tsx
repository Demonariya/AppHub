import React from 'react';
import { X } from 'lucide-react';
import { InstallationTask, Package } from '../../types';
import { AppIcon } from '../icons';
import { Button } from '../ui/Button';
import { OperationStatus } from './OperationStatus';

interface QueueTaskRowProps {
  task: InstallationTask;
  pkg: Package;
  position: number;
  onCancel: (taskId: string) => void;
}

export const QueueTaskRow: React.FC<QueueTaskRowProps> = ({
  task,
  pkg,
  position,
  onCancel,
}) => {
  const sizeLabel =
    task.action !== 'uninstall'
      ? pkg.formattedDownloadSize || pkg.formattedSize
      : undefined;

  return (
    <div className="p-4 flex items-center justify-between gap-4 hover:bg-[var(--surface-hover)]/60 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-xs font-mono text-[var(--text-muted)] w-6 tabular-nums shrink-0">
          #{position}
        </span>
        <AppIcon pkg={pkg} size="sm" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
            {task.packageName}{' '}
            <span className="text-[var(--text-muted)] font-mono text-[11px] uppercase font-normal">
              · {task.action}
            </span>
          </div>
          <div className="text-[11px] font-mono text-[var(--text-muted)] truncate tabular-nums">
            {task.packageId} · v{task.targetVersion || task.version}
            {sizeLabel ? ` · ${sizeLabel}` : ''}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <OperationStatus phase="queued" compact />
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Cancel queued ${task.packageName}`}
          onClick={() => onCancel(task.id)}
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
};
