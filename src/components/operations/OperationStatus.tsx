import React from 'react';
import { OperationPhase } from '../../types';
import { StatusBadge, StatusKind } from '../ui/StatusBadge';
import { formatBytes } from '../../services/catalog';

const PHASE_LABELS: Record<OperationPhase, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  downloading: 'Downloading',
  verifying: 'Verifying',
  installing: 'Installing',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const PHASE_TO_BADGE: Record<OperationPhase, StatusKind> = {
  queued: 'queued',
  preparing: 'running',
  downloading: 'running',
  verifying: 'running',
  installing: 'running',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
};

export function formatPhaseLabel(phase?: OperationPhase | string): string {
  if (!phase) return 'Running';
  return PHASE_LABELS[phase as OperationPhase] || phase;
}

export function formatByteRatio(downloaded?: number, total?: number): string | null {
  if (typeof downloaded === 'number' && downloaded > 0 && typeof total === 'number' && total > 0) {
    return `${formatBytes(downloaded)} / ${formatBytes(total)}`;
  }
  if (typeof downloaded === 'number' && downloaded > 0) {
    return `${formatBytes(downloaded)} downloaded`;
  }
  if (typeof total === 'number' && total > 0) {
    return `${formatBytes(total)} total`;
  }
  return null;
}

export function formatDurationMs(startedAt?: number, endedAt?: number): string | null {
  if (!startedAt) return null;
  const end = endedAt ?? Date.now();
  const totalSec = Math.max(0, Math.floor((end - startedAt) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins > 0) {
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

export function formatExitCode(code?: number | null): string | null {
  if (code === undefined || code === null) return null;
  if (code === 0) return 'Exit 0';
  if (code < 0 || code > 255) {
    return `0x${(code >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
  }
  return `Exit ${code}`;
}

interface OperationStatusProps {
  phase: OperationPhase;
  label?: string;
  compact?: boolean;
  className?: string;
}

export const OperationStatus: React.FC<OperationStatusProps> = ({
  phase,
  label,
  compact = false,
  className = '',
}) => {
  const badgeKind = PHASE_TO_BADGE[phase] || 'running';
  return (
    <StatusBadge
      status={badgeKind}
      label={label || formatPhaseLabel(phase)}
      compact={compact}
      className={className}
    />
  );
};
