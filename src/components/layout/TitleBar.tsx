import React from 'react';
import { Minus, Square, X, Terminal, Shield, CheckCircle2 } from 'lucide-react';
import { WinGetEnvironment } from '../../types';

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
  return (
    <div className="h-9 w-full bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800/80 flex items-center justify-between px-3 text-xs select-none sticky top-0 z-50">
      {/* Brand & Connection Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-medium tracking-tight text-neutral-200">
          <div className="w-4 h-4 rounded bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
            W
          </div>
          <span className="font-semibold text-neutral-100 text-xs">AppHub</span>
        </div>

        <span className="text-neutral-700" aria-hidden="true">|</span>

        {/* WinGet Engine Status Indicator */}
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span>WinGet {environment.version}</span>
          <span className="text-neutral-600 hidden sm:inline">·</span>
          <span className="text-neutral-500 hidden sm:inline">{environment.windowsVersion.split(' ')[0]} {environment.windowsVersion.split(' ')[1]}</span>
        </div>
      </div>

      {/* Middle Window Title */}
      <div className="hidden md:flex items-center gap-2 text-neutral-400 text-[11px]">
        <span>Windows Package Manager Store</span>
      </div>

      {/* Right Controls: Terminal toggle & Windows window buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpenTerminal}
          title="Toggle WinGet Terminal Output Console"
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors ${
            terminalOpen
              ? 'bg-neutral-800 text-sky-400 border border-neutral-700'
              : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">CLI Console</span>
        </button>

        <div className="flex items-center ml-2 border-l border-neutral-800 pl-1 text-neutral-400">
          <button
            title="Minimize"
            className="w-8 h-7 flex items-center justify-center hover:bg-neutral-800 hover:text-neutral-200 transition-colors rounded-sm"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            title="Maximize"
            className="w-8 h-7 flex items-center justify-center hover:bg-neutral-800 hover:text-neutral-200 transition-colors rounded-sm"
          >
            <Square className="w-3 h-3" />
          </button>
          <button
            title="Close"
            className="w-8 h-7 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors rounded-sm"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
