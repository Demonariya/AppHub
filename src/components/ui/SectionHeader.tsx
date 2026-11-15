import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  icon,
  action,
}) => {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-[var(--accent-primary)] shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-sm sm:text-[15px] font-semibold text-[var(--text-primary)] tracking-tight truncate">
            {title}
          </h2>
          {description && (
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{description}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  defaultOpen = false,
  icon,
  children,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-subtle)] overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && <span className="text-[var(--accent-primary)] shrink-0">{icon}</span>}
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[var(--text-primary)]">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="p-4 pt-3 border-t border-[var(--border-subtle)] space-y-4">
          {children}
        </div>
      )}
    </div>
  );
};
