import React from 'react';
import { Search, Command, RefreshCw, Sun, Moon, Menu, Activity } from 'lucide-react';
import { PageId } from './Sidebar';
import { Button } from '../ui';

interface TopHeaderProps {
  currentPage: PageId;
  selectedCategory?: string | null;
  onClearCategory?: () => void;
  onOpenQuickSearch: () => void;
  onRefreshCatalog: () => void;
  onNavigateToActivity?: () => void;
  activeOperationsCount?: number;
  isRefreshing?: boolean;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  onToggleMobileMenu?: () => void;
}

const PAGE_TITLES: Record<PageId, string> = {
  home: 'Home',
  discover: 'Explore',
  categories: 'Categories',
  installed: 'Installed',
  updates: 'Updates',
  downloads: 'Operations',
  library: 'Library',
  sources: 'Package Sources',
  settings: 'Settings',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentPage,
  selectedCategory,
  onClearCategory,
  onOpenQuickSearch,
  onRefreshCatalog,
  onNavigateToActivity,
  activeOperationsCount = 0,
  isRefreshing = false,
  theme,
  onToggleTheme,
  onToggleMobileMenu,
}) => {
  return (
    <header className="h-13 border-b border-[var(--border-subtle)] bg-[var(--surface-shell)]/90 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-30">
      {/* Left: Mobile Menu + Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] min-w-0">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            aria-label="Open navigation menu"
            className="md:hidden p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[6px] shrink-0 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-[var(--text-primary)] hidden sm:inline">AppHub</span>
          <span className="text-[var(--text-muted)] hidden sm:inline">/</span>
          {selectedCategory && onClearCategory ? (
            <button
              type="button"
              onClick={onClearCategory}
              className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {PAGE_TITLES[currentPage]}
            </button>
          ) : (
            <span className="text-[var(--text-primary)] font-medium truncate">
              {PAGE_TITLES[currentPage]}
            </span>
          )}
          {selectedCategory && (
            <>
              <span className="text-[var(--text-muted)]">/</span>
              <span className="text-[var(--accent-primary)] font-medium truncate">
                {selectedCategory}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Center: Command Search Trigger (Ctrl + K) */}
      <div className="flex-1 max-w-md mx-1 sm:mx-2">
        <button
          type="button"
          onClick={onOpenQuickSearch}
          aria-label="Search packages (Ctrl+K)"
          className="w-full h-8 flex items-center justify-between px-3 rounded-[8px] bg-[var(--surface-input)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors group cursor-pointer"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0" />
            <span className="truncate text-left">
              <span className="hidden sm:inline">Search WinGet apps, IDs, or publishers...</span>
              <span className="sm:hidden">Search packages...</span>
            </span>
          </div>

          <kbd className="hidden sm:inline-flex items-center gap-0.5 text-[10px] font-mono bg-[var(--surface-subtle)] text-[var(--text-muted)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] shrink-0">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </kbd>
        </button>
      </div>

      {/* Right: Operations shortcut + Refresh + Theme */}
      <div className="flex items-center gap-2 shrink-0">
        {activeOperationsCount > 0 && onNavigateToActivity && (
          <Button
            size="sm"
            variant="secondary"
            onClick={onNavigateToActivity}
            leftIcon={<Activity className="w-3.5 h-3.5 text-[var(--accent-primary)] animate-pulse" />}
            title="View active operations"
          >
            <span className="font-mono tabular-nums">{activeOperationsCount} active</span>
          </Button>
        )}

        <Button
          size="sm"
          variant="secondary"
          onClick={onRefreshCatalog}
          disabled={isRefreshing}
          title="Sync with WinGet repository (Ctrl+R)"
          leftIcon={
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[var(--accent-primary)]' : ''}`}
            />
          }
        >
          <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync WinGet'}</span>
        </Button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={`Switch theme (Current: ${theme})`}
          title={`Switch theme (Current: ${theme})`}
          className="w-7 h-7 inline-flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] rounded-[6px] border border-[var(--border-subtle)] transition-colors cursor-pointer"
        >
          {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>
    </header>
  );
};
