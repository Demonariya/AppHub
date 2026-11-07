import React from 'react';
import { Search, Command, RefreshCw, Sun, Moon, Menu } from 'lucide-react';
import { PageId } from './Sidebar';

interface TopHeaderProps {
  currentPage: PageId;
  selectedCategory?: string | null;
  onOpenQuickSearch: () => void;
  onRefreshCatalog: () => void;
  isRefreshing?: boolean;
  theme: 'dark' | 'light' | 'system';
  onToggleTheme: () => void;
  onToggleMobileMenu?: () => void;
}

const PAGE_TITLES: Record<PageId, string> = {
  home: 'Store Overview',
  discover: 'Package Catalog',
  categories: 'Software Categories',
  installed: 'Installed Applications',
  updates: 'Update Center',
  downloads: 'Installation Queue',
  library: 'Software Library',
  sources: 'Package Sources',
  settings: 'System Preferences',
};

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentPage,
  selectedCategory,
  onOpenQuickSearch,
  onRefreshCatalog,
  isRefreshing = false,
  theme,
  onToggleTheme,
  onToggleMobileMenu,
}) => {
  return (
    <header className="h-14 border-b border-neutral-800/80 bg-neutral-950/70 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-6 shrink-0 z-30">
      {/* Zone 1: Mobile Menu Button + Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs text-neutral-400 min-w-0">
        {onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-900 rounded-lg shrink-0"
            title="Toggle Navigation Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        <div className="flex items-center gap-1.5 truncate">
          <span className="font-semibold text-neutral-200 hidden sm:inline">AppHub</span>
          <span className="text-neutral-600 hidden sm:inline">/</span>
          <span className="text-neutral-300 font-medium truncate">{PAGE_TITLES[currentPage]}</span>
          {selectedCategory && (
            <>
              <span className="text-neutral-600">/</span>
              <span className="text-sky-400 font-medium truncate">{selectedCategory}</span>
            </>
          )}
        </div>
      </div>

      {/* Zone 2: Global Search Bar Affordance (Ctrl + K) */}
      <div className="flex-1 max-w-lg mx-1 sm:mx-2">
        <button
          onClick={onOpenQuickSearch}
          className="w-full flex items-center justify-between px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-400 hover:text-neutral-200 transition-all shadow-inner group"
        >
          <div className="flex items-center gap-2 truncate">
            <Search className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-400 shrink-0" />
            <span className="text-neutral-400 group-hover:text-neutral-300 truncate text-left">
              <span className="hidden sm:inline">Search packages, IDs, publishers, tags...</span>
              <span className="sm:hidden">Search packages...</span>
            </span>
          </div>

          <div className="hidden xs:flex items-center gap-1 text-[10px] font-mono bg-neutral-800/80 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700 shrink-0">
            <Command className="w-3 h-3" />
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Zone 3: Actions (Refresh & Theme Toggle) */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onRefreshCatalog}
          disabled={isRefreshing}
          title="Sync with WinGet repository"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
          <span className="hidden sm:inline">{isRefreshing ? 'Syncing...' : 'Sync WinGet'}</span>
        </button>

        <button
          onClick={onToggleTheme}
          title={`Switch theme (Current: ${theme})`}
          className="p-1.5 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 rounded-lg border border-neutral-800 transition-colors"
        >
          {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
