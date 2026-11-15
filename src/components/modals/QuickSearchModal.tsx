import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ShieldCheck, ArrowRight, History, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Package } from '../../types';
import { storage } from '../../services/storage';
import { wingetEngine } from '../../services/wingetEngine';
import { isTauriEnvironment } from '../../services/tauriBridge';
import { AppIconImage } from '../common/AppIconImage';
import { StatusBadge } from '../ui';

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
  const [liveResults, setLiveResults] = useState<Package[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      setHistory(storage.getSearchHistory());
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
      setLiveResults([]);
      setSearchError(null);
      setIsSearching(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const trimmed = query.trim();
    if (!trimmed || !isTauriEnvironment() || trimmed.length < 2) {
      setLiveResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const requestSeq = ++seqRef.current;
    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await wingetEngine.searchPackages(trimmed);
        if (seqRef.current !== requestSeq) return;
        setLiveResults(res);
      } catch (err: any) {
        if (seqRef.current !== requestSeq) return;
        setLiveResults([]);
        setSearchError(err?.message || 'WinGet search failed');
      } finally {
        if (seqRef.current === requestSeq) {
          setIsSearching(false);
        }
      }
    }, 320);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  const trimmed = query.trim().toLowerCase();

  const localMatches = trimmed
    ? packages.filter(
        p =>
          p.name.toLowerCase().includes(trimmed) ||
          p.id.toLowerCase().includes(trimmed) ||
          (p.publisher || '').toLowerCase().includes(trimmed) ||
          p.category.toLowerCase().includes(trimmed) ||
          p.tags.some(t => t.toLowerCase().includes(trimmed))
      )
    : [];

  const mergedMap = new Map<string, Package>();
  const getKey = (p: Package) => p.packageKey || `${p.source.toLowerCase()}::${p.id.toLowerCase()}`;
  for (const p of localMatches) {
    mergedMap.set(getKey(p), p);
  }
  const byKeyAll = new Map(packages.map(p => [getKey(p), p]));
  for (const r of liveResults) {
    const key = getKey(r);
    const known = byKeyAll.get(key);
    mergedMap.set(
      key,
      known ? { ...r, ...known, version: r.version || known.version } : r
    );
  }
  const results = Array.from(mergedMap.values()).slice(0, 10);

  const handleSelect = (pkg: Package) => {
    storage.addSearchQuery(query.trim() || pkg.name);
    onSelectPackage(pkg);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[selectedIndex];
      if (target) handleSelect(target);
    }
  };

  const handleClearHistory = () => {
    storage.clearSearchHistory();
    setHistory([]);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick Package Search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-20 p-4 bg-[var(--surface-backdrop)] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--surface-panel)] border border-[var(--border-strong)] rounded-[14px] shadow-[var(--shadow-dialog)] overflow-hidden animate-page-in flex flex-col max-h-[75vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Command Search Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
          {isSearching ? (
            <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin shrink-0" />
          ) : (
            <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onKeyDown={handleKeyDown}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-label="Search WinGet packages"
            placeholder="Search Microsoft WinGet by name, publisher, or ID (e.g. Git.Git)..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono bg-[var(--surface-panel)] text-[var(--text-muted)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
            ESC
          </kbd>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-2.5 divide-y divide-[var(--border-subtle)]">
          {query ? (
            <>
              {searchError && (
                <div className="mx-1 my-2 p-2.5 rounded-[8px] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] text-xs text-[var(--status-danger-fg)] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>WinGet live query error: {searchError}</span>
                </div>
              )}

              {results.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    Matching Packages ({results.length})
                  </div>
                  {results.map((pkg, idx) => (
                    <button
                      key={pkg.packageKey || `${pkg.source}::${pkg.id}`}
                      type="button"
                      onClick={() => handleSelect(pkg)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[8px] text-left transition-colors group cursor-pointer ${
                        idx === selectedIndex ? 'bg-[var(--surface-active)]' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <AppIconImage pkg={pkg} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] truncate">
                              {pkg.name}
                            </span>
                            {pkg.verified && !pkg.isExternal && (
                              <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                            )}
                            {pkg.isInstalled && (
                              <StatusBadge status="installed" compact />
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono truncate mt-0.5">
                            {pkg.id}
                            {pkg.publisher ? ` · ${pkg.publisher}` : ` · ${pkg.source}`} · v{pkg.latestVersion}
                          </div>
                        </div>
                      </div>

                      <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-primary)] shrink-0" />
                    </button>
                  ))}
                </div>
              ) : isSearching ? (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)]">
                  Querying Microsoft WinGet catalog...
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-[var(--text-secondary)] space-y-1">
                  <p className="font-medium text-[var(--text-primary)]">
                    No WinGet packages found matching &ldquo;{query}&rdquo;
                  </p>
                  <p className="text-[var(--text-muted)]">
                    Try searching by official package ID or shorter keyword.
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4 p-2">
              {history.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5" />
                      Recent Searches
                    </span>
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      className="text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] flex items-center gap-1 text-[11px] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {history.map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => {
                          setQuery(item);
                          setSelectedIndex(0);
                        }}
                        className="px-2.5 py-1 text-xs rounded-[6px] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition-colors cursor-pointer"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={history.length > 0 ? 'pt-3 border-t border-[var(--border-subtle)]' : ''}>
                <div className="px-1 py-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                  Quick Suggestions
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
                  {['Visual Studio Code', 'Firefox', 'Docker Desktop', 'Steam', 'Git', 'Obsidian'].map(
                    quick => (
                      <button
                        key={quick}
                        type="button"
                        onClick={() => setQuery(quick)}
                        className="text-left px-3 py-2 rounded-[8px] bg-[var(--surface-subtle)] hover:bg-[var(--surface-hover)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] transition-colors truncate cursor-pointer"
                      >
                        {quick}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Keyboard Footer */}
        <div className="px-4 py-2 bg-[var(--surface-shell)] border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-muted)]">
          <span>Search powered by Microsoft WinGet catalog</span>
          <div className="flex items-center gap-3 font-mono">
            <span>↑ ↓ Navigate</span>
            <span>↵ Open</span>
            <span>Esc Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};
