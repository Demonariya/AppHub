import React from 'react';
import {
  CheckCircle2,
  ArrowUpCircle,
  Loader2,
  Clock,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  HardDrive,
} from 'lucide-react';

export type StatusKind =
  | 'installed'
  | 'update'
  | 'external'
  | 'running'
  | 'queued'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'verified'
  | 'community';

interface StatusBadgeProps {
  status: StatusKind;
  label?: string;
  compact?: boolean;
  className?: string;
}

const STATUS_CONFIG: Record<
  StatusKind,
  {
    defaultLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    styleClass: string;
    spin?: boolean;
  }
> = {
  installed: {
    defaultLabel: 'Installed',
    icon: CheckCircle2,
    styleClass:
      'text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border-[var(--status-success-border)]',
  },
  update: {
    defaultLabel: 'Update Available',
    icon: ArrowUpCircle,
    styleClass:
      'text-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] border-[var(--status-warning-border)]',
  },
  external: {
    defaultLabel: 'External App',
    icon: HardDrive,
    styleClass:
      'text-[var(--text-secondary)] bg-[var(--surface-subtle)] border-[var(--border-subtle)]',
  },
  running: {
    defaultLabel: 'Running',
    icon: Loader2,
    styleClass:
      'text-[var(--accent-primary)] bg-[var(--accent-soft)] border-[var(--accent-border)]',
    spin: true,
  },
  queued: {
    defaultLabel: 'Queued',
    icon: Clock,
    styleClass:
      'text-[var(--text-secondary)] bg-[var(--surface-subtle)] border-[var(--border-subtle)]',
  },
  completed: {
    defaultLabel: 'Completed',
    icon: CheckCircle2,
    styleClass:
      'text-[var(--status-success-fg)] bg-[var(--status-success-bg)] border-[var(--status-success-border)]',
  },
  failed: {
    defaultLabel: 'Failed',
    icon: XCircle,
    styleClass:
      'text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border-[var(--status-danger-border)]',
  },
  cancelled: {
    defaultLabel: 'Cancelled',
    icon: AlertTriangle,
    styleClass:
      'text-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] border-[var(--status-warning-border)]',
  },
  verified: {
    defaultLabel: 'Verified Source',
    icon: ShieldCheck,
    styleClass:
      'text-[var(--accent-primary)] bg-[var(--accent-soft)] border-[var(--accent-border)]',
  },
  community: {
    defaultLabel: 'Community Source',
    icon: ShieldAlert,
    styleClass:
      'text-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] border-[var(--status-warning-border)]',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  compact = false,
  className = '',
}) => {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 border rounded-[6px] font-medium whitespace-nowrap shrink-0 ${
        compact ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-xs'
      } ${cfg.styleClass} ${className}`}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.spin ? 'animate-spin' : ''}`} />
      <span>{label || cfg.defaultLabel}</span>
    </span>
  );
};
