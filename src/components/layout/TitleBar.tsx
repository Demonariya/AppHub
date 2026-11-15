import React from 'react';
import { Minus, Square, X, Terminal, CheckCircle2, AlertTriangle } from 'lucide-react';
import { WinGetEnvironment } from '../../types';
import { isTauriEnvironment } from '../../services/tauriBridge';

interface TitleBarProps {
  environment: WinGetEnvironment;
  onOpenTerminal?: () => void;
  terminalOpen?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  environment,
  onOpenTerminal,
  terminalOpen,
}) => {
  const isTauri = isTauriEnvironment();

  const handleMinimize = async () => {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error('Window minimize failed:', e);
    }
  };

  const handleToggleMaximize = async () => {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error('Window toggleMaximize failed:', e);
    }
  };

  const handleClose = async () => {
    if (!isTauri) return;
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().close();
    } catch (e) {
      console.error('Window close failed:', e);
    }
  };

  return (
    <div
      data-tauri-drag-region
      className="h-9 w-full bg-[var(--surface-shell)] border-b border-[var(--border-subtle)] flex items-center justify-between px-3 text-xs select-none sticky top-0 z-50 shrink-0"
    >
      {/* Left: Brand & Real WinGet Status */}
      <div className="flex items-center gap-3 min-w-0" data-tauri-drag-region>
        <div className="flex items-center gap-2 font-medium tracking-tight">
          <div className="w-4 h-4 rounded-[4px] bg-[var(--accent-primary)] flex items-center justify-center text-[10px] font-bold text-[var(--accent-primary-contrast)]">
            A
          </div>
          <span className="font-semibold text-[var(--text-primary)] text-xs">AppHub</span>
        </div>

        <span className="text-[var(--border-strong)]" aria-hidden="true">|</span>

        <div
          className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] truncate"
          title={environment.error || `WinGet path: ${environment.path || 'auto'}`}
        >
          {environment.isInstalled ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success-fg)] shrink-0" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-[var(--status-warning-fg)] shrink-0" />
          )}
          <span className={environment.isInstalled ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--status-warning-fg)]'}>
            WinGet {environment.version}
          </span>
          {environment.windowsVersion && (
            <>
              <span className="text-[var(--text-muted)] hidden sm:inline">·</span>
              <span className="text-[var(--text-muted)] hidden sm:inline truncate">
                {environment.windowsVersion}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Right: CLI Console Toggle & Native Caption Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onOpenTerminal}
          title="Toggle WinGet CLI Console (Ctrl+`)"
          aria-pressed={terminalOpen}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[11px] font-medium transition-colors cursor-pointer ${
            terminalOpen
              ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)] border border-[var(--accent-border)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] border border-transparent'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CLI Console</span>
        </button>

        {isTauri && (
          <div className="flex items-center ml-1.5 border-l border-[var(--border-subtle)] pl-1 text-[var(--text-secondary)]">
            <button
              type="button"
              onClick={handleMinimize}
              aria-label="Minimize window"
              className="w-8 h-7 flex items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors rounded-[4px] cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleToggleMaximize}
              aria-label="Maximize or restore window"
              className="w-8 h-7 flex items-center justify-center hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors rounded-[4px] cursor-pointer"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close application"
              className="w-8 h-7 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors rounded-[4px] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
