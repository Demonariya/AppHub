import React from 'react';
import { Search, X, Loader2 } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  loading?: boolean;
  onClear?: () => void;
  shortcutHint?: string;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  ariaLabel,
  loading = false,
  onClear,
  shortcutHint,
  className = '',
  inputRef,
  onKeyDown,
}) => {
  const handleClear = () => {
    onChange('');
    onClear?.();
  };

  return (
    <div className={`relative flex items-center ${className}`}>
      {loading ? (
        <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin absolute left-3 pointer-events-none" />
      ) : (
        <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 pointer-events-none" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        className="w-full h-9 pl-9 pr-14 bg-[var(--surface-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] focus:border-[var(--border-focus)] rounded-[8px] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:outline-none"
      />
      <div className="absolute right-2.5 flex items-center gap-1.5">
        {value && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        {shortcutHint && !value && (
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] rounded">
            {shortcutHint}
          </kbd>
        )}
      </div>
    </div>
  );
};
