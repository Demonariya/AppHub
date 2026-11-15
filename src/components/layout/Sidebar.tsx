import React from 'react';
import {
  Home,
  Compass,
  LayoutGrid,
  CheckSquare,
  ArrowUpCircle,
  Activity,
  Bookmark,
  Database,
  Settings,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';

export type PageId =
  | 'home'
  | 'discover'
  | 'categories'
  | 'installed'
  | 'updates'
  | 'downloads'
  | 'library'
  | 'sources'
  | 'settings';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  updatesCount: number;
  activeDownloadsCount: number;
  isCompact?: boolean;
  onToggleCompact?: () => void;
  isOpenOnMobile?: boolean;
  onCloseMobile?: () => void;
}

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  badgeTone?: 'warning' | 'accent';
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  updatesCount,
  activeDownloadsCount,
  isCompact = false,
  onToggleCompact,
  isOpenOnMobile = false,
  onCloseMobile,
}) => {
  const navGroups: NavGroup[] = [
    {
      label: 'Discover',
      items: [
        { id: 'home', label: 'Home', icon: Home },
        { id: 'discover', label: 'Explore', icon: Compass },
        { id: 'categories', label: 'Categories', icon: LayoutGrid },
      ],
    },
    {
      label: 'My Apps',
      items: [
        { id: 'installed', label: 'Installed', icon: CheckSquare },
        {
          id: 'updates',
          label: 'Updates',
          icon: ArrowUpCircle,
          badge: updatesCount > 0 ? updatesCount : undefined,
          badgeTone: 'warning',
        },
        { id: 'library', label: 'Library', icon: Bookmark },
      ],
    },
    {
      label: 'Activity',
      items: [
        {
          id: 'downloads',
          label: 'Operations',
          icon: Activity,
          badge: activeDownloadsCount > 0 ? activeDownloadsCount : undefined,
          badgeTone: 'accent',
        },
      ],
    },
    {
      label: 'System',
      items: [
        { id: 'sources', label: 'Package Sources', icon: Database },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const handleItemClick = (id: PageId) => {
    onSelectPage(id);
    onCloseMobile?.();
  };

  const navContent = (
    <div className="flex flex-col justify-between h-full">
      <nav aria-label="Primary Navigation" className="p-2.5 space-y-4 overflow-y-auto">
        {onCloseMobile && (
          <div className="md:hidden flex items-center justify-between px-2 py-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Navigation
            </span>
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation menu"
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {navGroups.map((group, gIdx) => (
          <div key={group.label} className={gIdx > 0 ? 'pt-1' : ''}>
            {(!isCompact || isOpenOnMobile) ? (
              <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group.label}
              </div>
            ) : (
              gIdx > 0 && <div className="mx-2 my-2 border-t border-[var(--border-subtle)]" />
            )}

            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;
                const badgeClass =
                  item.badgeTone === 'warning'
                    ? 'text-[var(--status-warning-fg)] bg-[var(--status-warning-bg)] border-[var(--status-warning-border)]'
                    : 'text-[var(--accent-primary)] bg-[var(--accent-soft)] border-[var(--accent-border)]';

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCompact && !isOpenOnMobile ? item.label : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-xs transition-colors text-left relative cursor-pointer ${
                      isActive
                        ? 'bg-[var(--surface-active)] text-[var(--text-primary)] font-semibold'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] font-medium'
                    } ${isCompact && !isOpenOnMobile ? 'justify-center px-0' : ''}`}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-[var(--accent-primary)] rounded-r" />
                    )}
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-[var(--accent-primary)]' : 'text-[var(--text-muted)]'
                      }`}
                    />

                    {(!isCompact || isOpenOnMobile) && (
                      <span className="truncate flex-1">{item.label}</span>
                    )}

                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-semibold tabular-nums px-1.5 py-0.5 rounded-[5px] border leading-none ${badgeClass} ${
                          isCompact && !isOpenOnMobile ? 'absolute top-1 right-1 px-1' : ''
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse Toggle Footer */}
      {onToggleCompact && (
        <div className="p-2.5 border-t border-[var(--border-subtle)] hidden md:block">
          <button
            type="button"
            onClick={onToggleCompact}
            aria-label={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full flex items-center justify-center gap-2 h-8 px-2 rounded-[8px] hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs transition-colors cursor-pointer"
          >
            {isCompact ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-medium truncate">Collapse Sidebar</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <>
      <aside
        className={`hidden md:flex h-[calc(100vh-var(--titlebar-h,36px))] bg-[var(--surface-shell)] border-r border-[var(--border-subtle)] flex-col justify-between transition-all duration-200 select-none shrink-0 ${
          isCompact ? 'w-16' : 'w-56'
        }`}
      >
        {navContent}
      </aside>

      {isOpenOnMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-[var(--surface-backdrop)] backdrop-blur-sm"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 h-full bg-[var(--surface-shell)] border-r border-[var(--border-strong)] shadow-[var(--shadow-dialog)] flex flex-col justify-between animate-page-in">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
