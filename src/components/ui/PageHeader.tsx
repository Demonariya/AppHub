import React from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  breadcrumbs,
  actions,
  meta,
}) => {
  return (
    <div className="flex flex-col gap-3 pb-4 border-b border-[var(--border-subtle)]">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={crumb.label + idx}>
              {idx > 0 && <ChevronRight className="w-3.5 h-3.5 opacity-60 shrink-0" />}
              {crumb.onClick ? (
                <button
                  type="button"
                  onClick={crumb.onClick}
                  className="hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                >
                  {crumb.label}
                </button>
              ) : (
                <span className="text-[var(--text-secondary)] font-medium">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--text-primary)] text-balance">
              {title}
            </h1>
            {meta}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-[13px] text-[var(--text-secondary)] mt-1 leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
};
