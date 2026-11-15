import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => {
  return (
    <div
      className={`rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] text-center flex flex-col items-center justify-center ${
        compact ? 'py-10 px-4' : 'py-16 px-6'
      }`}
    >
      <div className="w-11 h-11 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--text-secondary)] mt-1 max-w-md leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Operation Error',
  message,
  onRetry,
  onDismiss,
}) => {
  return (
    <div
      role="alert"
      className="p-3.5 rounded-[10px] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertCircle className="w-4 h-4 text-[var(--status-danger-fg)] shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-[var(--status-danger-fg)]">{title}</div>
          <p className="text-[var(--text-primary)] mt-0.5 break-words">{message}</p>
        </div>
      </div>

      {(onRetry || onDismiss) && (
        <div className="flex items-center gap-2 shrink-0">
          {onRetry && (
            <Button size="sm" variant="danger" leftIcon={<RefreshCw className="w-3 h-3" />} onClick={onRetry}>
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export const SkeletonGrid: React.FC<{ count?: number }> = ({ count = 8 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-panel)] p-4 space-y-3 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[8px] bg-[var(--surface-hover)] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-3/4 rounded bg-[var(--surface-hover)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--surface-hover)]" />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-full rounded bg-[var(--surface-hover)]" />
            <div className="h-3 w-5/6 rounded bg-[var(--surface-hover)]" />
          </div>
          <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
            <div className="h-3 w-20 rounded bg-[var(--surface-hover)]" />
            <div className="h-7 w-16 rounded-[6px] bg-[var(--surface-hover)]" />
          </div>
        </div>
      ))}
    </div>
  );
};
