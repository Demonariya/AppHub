import React, { useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  maxWidthClass?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  maxWidthClass = 'max-w-lg',
  footer,
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-backdrop)] backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`w-full ${maxWidthClass} bg-[var(--surface-panel)] border border-[var(--border-strong)] rounded-[14px] shadow-[var(--shadow-dialog)] overflow-hidden flex flex-col max-h-[90vh] animate-page-in`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
          <div className="flex items-center gap-3 min-w-0">
            {icon && <div className="shrink-0">{icon}</div>}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{title}</h3>
              {subtitle && (
                <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-5 py-3.5 border-t border-[var(--border-subtle)] bg-[var(--surface-subtle)] flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

interface ConfirmationDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'warning' | 'danger';
  loading?: boolean;
  children?: React.ReactNode;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'warning',
  loading = false,
  children,
}) => {
  const isDanger = tone === 'danger';

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      subtitle={description}
      maxWidthClass="max-w-md"
      icon={
        <div
          className={`w-9 h-9 rounded-[8px] border flex items-center justify-center ${
            isDanger
              ? 'bg-[var(--status-danger-bg)] border-[var(--status-danger-border)] text-[var(--status-danger-fg)]'
              : 'bg-[var(--status-warning-bg)] border-[var(--status-warning-border)] text-[var(--status-warning-fg)]'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'warning'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children || (
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Please confirm you want to proceed with this action.
        </p>
      )}
    </Dialog>
  );
};
