import React from 'react';

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

interface SegmentedTabsProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel = 'Filter options',
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-center gap-1 p-1 bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded-[8px]"
    >
      {options.map(opt => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-[6px] whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              active
                ? 'bg-[var(--surface-panel)] text-[var(--text-primary)] font-semibold border border-[var(--border-strong)] shadow-xs'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent'
            }`}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  mono?: boolean;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
  label,
  value,
  onChange,
  options,
  mono = false,
}) => {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] shrink-0">
      <span className="text-[var(--text-muted)]">{label}:</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className={`h-8 px-2.5 bg-[var(--surface-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[6px] text-xs text-[var(--text-primary)] focus:outline-none cursor-pointer ${
          mono ? 'font-mono' : ''
        }`}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
};
