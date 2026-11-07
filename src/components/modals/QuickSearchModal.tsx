import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Command, ShieldCheck, ArrowRight, History, Trash2 } from 'lucide-react';
import { Package } from '../../types';
import { storage } from '../../services/storage';
import { AppIconImage } from '../common/AppIconImage';

interface QuickSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  packages: Package[];
  onSelectPackage: (pkg: Package) => void;
}

export const QuickSearchModal: React.FC<QuickSearchModalProps> = ({
  isOpen,
  onClose,
  packages,
  onSelectPackage,
}) => {
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHistory(storage.getSearchHistory());
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const trimmed = query.trim().toLowerCase();

  const filtered = trimmed
    ? packages
        .filter(
          p =>
            p.name.toLowerCase().includes(trimmed) ||
            p.id.toLowerCase().includes(trimmed) ||
            p.publisher.toLowerCase().includes(trimmed) ||
            p.category.toLowerCase().includes(trimmed) ||
            p.tags.some(t => t.toLowerCase().includes(trimmed))
        )
        .slice(0, 8)
    : [];

  const handleSelect = (pkg: Package) => {
    storage.addSearchQuery(pkg.name);
    onSelectPackage(pkg);
    onClose();
  };

  const handleSelectHistory = (term: string) => {
    setQuery(term);
  };

  const handleClearHistory = () => {
    storage.clearSearchHistory();
    setHistory([]);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-neutral-800 bg-neutral-950/60">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a package name, ID (e.g. Git.Git), publisher, or tag..."
            className="flex-1 bg-transparent text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-neutral-500 hover:text-neutral-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono bg-neutral-800 text-neutral-400 px-1.5 py-0.5 rounded border border-neutral-700">
            ESC
          </kbd>
        </div>

        {/* Results / History view */}
        <div className="overflow-y-auto p-2 divide-y divide-neutral-800/50">
          {query ? (
            filtered.length > 0 ? (
              <div className="space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Matching Packages ({filtered.length})
                </div>
                {filtered.map(pkg => (
                  <button
                    key={pkg.id}
                    onClick={() => handleSelect(pkg)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-neutral-800/80 text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AppIconImage pkg={pkg} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-neutral-200 group-hover:text-sky-300 truncate">
                            {pkg.name}
                          </span>
                          {pkg.verified && (
                            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-mono truncate">
                          {pkg.id} · {pkg.publisher} · v{pkg.latestVersion}
                        </div>
                      </div>
                    </div>

                    <ArrowRight className="w-4 h-4 text-neutral-600 group-hover:text-neutral-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-neutral-400 space-y-1">
                <p>No WinGet packages found matching "{query}"</p>
                <p className="text-neutral-400">Try searching by official package ID or generic category.</p>
              </div>
            )
          ) : (
            <div className="space-y-3 p-2">
              {history.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />
                      Recent Searches
                    </span>
                    <button
                      onClick={handleClearHistory}
                      className="text-neutral-400 hover:text-red-400 flex items-center gap-1 text-[10px]"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {history.map(item => (
                      <button
                        key={item}
                        onClick={() => handleSelectHistory(item)}
                        className="px-2.5 py-1 text-xs rounded-md bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 border border-neutral-700/60 transition-colors"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-neutral-800">
                <div className="px-2 py-1 text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                  Popular Quick Searches
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                  {['Visual Studio Code', 'Firefox', 'Docker Desktop', 'Steam', 'Git', 'Obsidian'].map(quick => (
                    <button
                      key={quick}
                      onClick={() => setQuery(quick)}
                      className="text-left px-2.5 py-1.5 rounded-lg bg-neutral-950/60 hover:bg-neutral-800 border border-neutral-800 text-xs text-neutral-300 transition-colors truncate"
                    >
                      {quick}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-4 py-2 bg-neutral-950/80 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
          <span>Search powered by Microsoft WinGet catalog</span>
          <div className="flex items-center gap-3">
            <span>Navigate: ↑ ↓</span>
            <span>Select: ↵</span>
            <span>Dismiss: Esc</span>
          </div>
        </div>
      </div>
    </div>
  );
};
