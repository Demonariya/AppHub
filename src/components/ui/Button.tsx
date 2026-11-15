import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'warning' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-[var(--accent-primary-contrast)] font-semibold border border-transparent shadow-sm',
  secondary:
    'bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] font-medium border border-[var(--border-strong)]',
  warning:
    'bg-[var(--status-warning-bg)] hover:opacity-90 text-[var(--status-warning-fg)] font-semibold border border-[var(--status-warning-border)]',
  danger:
    'bg-[var(--status-danger-bg)] hover:opacity-90 text-[var(--status-danger-fg)] font-medium border border-[var(--status-danger-border)]',
  ghost:
    'bg-transparent hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium border border-transparent',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-[6px] gap-1.5',
  md: 'h-8 px-3.5 text-xs rounded-[8px] gap-1.5',
  lg: 'h-10 px-5 text-[13px] rounded-[8px] gap-2',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-colors duration-150 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
};
