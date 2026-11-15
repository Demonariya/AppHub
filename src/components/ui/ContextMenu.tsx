import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  ariaLabel?: string;
  align?: 'left' | 'right';
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  items,
  ariaLabel = 'More actions',
  align = 'right',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="relative inline-flex shrink-0"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(prev => !prev)}
        className="w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 z-50 min-w-[180px] py-1 rounded-[8px] bg-[var(--surface-elevated)] border border-[var(--border-strong)] shadow-[var(--shadow-dialog)] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map(item => (
            <React.Fragment key={item.id}>
              {item.dividerBefore && (
                <div className="my-1 border-t border-[var(--border-subtle)]" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left whitespace-nowrap transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  item.tone === 'danger'
                    ? 'text-[var(--status-danger-fg)] hover:bg-[var(--status-danger-bg)]'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                {item.icon && <span className="shrink-0 opacity-85">{item.icon}</span>}
                <span className="truncate">{item.label}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};
