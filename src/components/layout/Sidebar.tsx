import React from 'react';
import {
  Home,
  Compass,
  Grid,
  CheckSquare,
  ArrowUpCircle,
  Download,
  Bookmark,
  Database,
  Settings,
  ShieldCheck,
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
  const navItems = [
    { id: 'home' as PageId, label: 'Home', icon: Home },
    { id: 'discover' as PageId, label: 'Discover', icon: Compass },
    { id: 'categories' as PageId, label: 'Categories', icon: Grid },
    { id: 'installed' as PageId, label: 'Installed', icon: CheckSquare },
    {
      id: 'updates' as PageId,
      label: 'Updates',
      icon: ArrowUpCircle,
      badge: updatesCount > 0 ? updatesCount : undefined,
      badgeColor: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    },
    {
      id: 'downloads' as PageId,
      label: 'Downloads',
      icon: Download,
      badge: activeDownloadsCount > 0 ? activeDownloadsCount : undefined,
      badgeColor: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    },
    { id: 'library' as PageId, label: 'Library', icon: Bookmark },
    { id: 'sources' as PageId, label: 'Package Sources', icon: Database },
    { id: 'settings' as PageId, label: 'Settings', icon: Settings },
  ];

  const handleItemClick = (id: PageId) => {
    onSelectPage(id);
    if (onCloseMobile) onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col justify-between h-full">
      {/* Navigation list */}
      <div className="p-2 space-y-1">
        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold tracking-wider uppercase text-neutral-300">
          <span>{isCompact ? '•••' : 'Store Navigation'}</span>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="md:hidden p-1 text-neutral-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleItemClick(item.id)}
              title={isCompact ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors text-left relative ${
                isActive
                  ? 'bg-neutral-800 text-neutral-100 font-semibold'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900/80'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-sky-400 rounded-r" />
              )}
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-400' : 'text-neutral-400'}`} />

              {(!isCompact || isOpenOnMobile) && (
                <span className="truncate flex-1">{item.label}</span>
              )}

              {item.badge !== undefined && (
                <span
                  className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded border ${item.badgeColor} ${
                    isCompact && !isOpenOnMobile ? 'absolute top-1 right-1' : ''
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer / Toggle & Status */}
      <div className="p-3 border-t border-neutral-800/60 space-y-2">
        {(!isCompact || isOpenOnMobile) && (
          <div className="px-2 py-2 rounded bg-neutral-900/50 border border-neutral-800/60 text-[11px] text-neutral-400 space-y-1">
            <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
              <span>WinGet Official</span>
            </div>
            <div className="text-[10px] text-neutral-300">
              Microsoft WinGet community repository verified.
            </div>
          </div>
        )}

        {onToggleCompact && (
          <button
            onClick={onToggleCompact}
            title={isCompact ? 'Expand sidebar' : 'Collapse sidebar'}
            className="hidden md:flex w-full items-center justify-center gap-2 p-1.5 rounded hover:bg-neutral-900 text-neutral-400 hover:text-neutral-200 text-xs transition-colors"
          >
            {isCompact ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                <span className="text-[11px]">Collapse View</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Docked Sidebar */}
      <aside
        className={`hidden md:flex h-[calc(100vh-2.25rem)] bg-neutral-950 border-r border-neutral-800/80 flex-col justify-between transition-all duration-200 select-none ${
          isCompact ? 'w-16' : 'w-56'
        }`}
      >
        {navContent}
      </aside>

      {/* Mobile Slide-in Drawer with Backdrop Overlay */}
      {isOpenOnMobile && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={onCloseMobile}
          />
          <aside className="relative z-10 w-64 h-full bg-neutral-950 border-r border-neutral-800 shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-200">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
