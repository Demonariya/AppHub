import React, { useState } from 'react';
import { PackageSource } from '../types';
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  ExternalLink,
  X,
  AlertTriangle,
} from 'lucide-react';
import { DEFAULT_SOURCES, storage } from '../services/storage';

interface PackageSourcesPageProps {
  sources: PackageSource[];
  onUpdateSources: (sources: PackageSource[]) => void;
  onRefreshAllSources: () => void;
  isRefreshing?: boolean;
}

export const PackageSourcesPage: React.FC<PackageSourcesPageProps> = ({
  sources,
  onUpdateSources,
  onRefreshAllSources,
  isRefreshing = false,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleToggleSource = (id: string) => {
    const next = sources.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    storage.saveSources(next);
    onUpdateSources(next);
  };

  const handleRemoveSource = (id: string) => {
    const next = sources.filter(s => s.id !== id);
    storage.saveSources(next);
    onUpdateSources(next);
  };

  const handleResetToDefault = () => {
    storage.saveSources(DEFAULT_SOURCES);
    onUpdateSources(DEFAULT_SOURCES);
  };

  const handleAddSource = () => {
    setValidationError(null);
    if (!sourceName.trim() || !sourceUrl.trim()) {
      setValidationError('Please provide both a source name and repository URL.');
      return;
    }

    if (!sourceUrl.startsWith('https://')) {
      setValidationError('Source URL must use secure HTTPS protocol.');
      return;
    }

    if (sources.some(s => s.name.toLowerCase() === sourceName.trim().toLowerCase())) {
      setValidationError(`A source with name "${sourceName.trim()}" already exists.`);
      return;
    }

    const created: PackageSource = {
      id: `src_${Date.now()}`,
      name: sourceName.trim(),
      arg: sourceUrl.trim(),
      type: 'custom',
      enabled: true,
      isOfficial: false,
      lastUpdated: new Date().toISOString().replace('T', ' ').slice(0, 19),
      packageCount: 0,
      trustLevel: 'community',
    };

    const next = [...sources, created];
    storage.saveSources(next);
    onUpdateSources(next);
    setSourceName('');
    setSourceUrl('');
    setShowAddModal(false);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Package Sources</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Configure upstream package repositories queried by Microsoft WinGet.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onRefreshAllSources}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            <span>{isRefreshing ? 'Updating Sources...' : 'winget source update'}</span>
          </button>

          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 bg-neutral-900 border border-neutral-800 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Sources</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Add Source</span>
          </button>
        </div>
      </div>

      {/* Security notice regarding third party sources */}
      <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800 flex items-start gap-3 text-xs text-neutral-300">
        <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Official sources like <code className="text-sky-300 font-mono">winget</code> and <code className="text-sky-300 font-mono">msstore</code> are cryptographically verified by Microsoft before ingestion. Custom third-party sources should only be added if you explicitly trust the provider.
        </p>
      </div>

      {/* Source Cards */}
      <div className="space-y-3">
        {sources.map(source => (
          <div
            key={source.id}
            className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0">
                <Database className="w-5 h-5 text-sky-400" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-neutral-100">{source.name}</span>
                  {source.isOfficial ? (
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Official Microsoft
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                      <ShieldAlert className="w-3.5 h-3.5" /> Custom Source
                    </span>
                  )}
                </div>

                <div className="text-xs font-mono text-neutral-400 truncate mt-1">
                  Argument: <span className="text-neutral-300">{source.arg}</span>
                </div>

                <div className="flex items-center gap-3 text-[11px] text-neutral-500 font-mono mt-1">
                  <span>Packages: {source.packageCount.toLocaleString()}</span>
                  <span>·</span>
                  <span>Last synced: {source.lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={() => handleToggleSource(source.id)}
                  className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 cursor-pointer"
                />
                <span>Enabled</span>
              </label>

              {!source.isOfficial && (
                <button
                  onClick={() => handleRemoveSource(source.id)}
                  title="Remove custom source"
                  className="p-1.5 text-neutral-500 hover:text-red-400 rounded-lg hover:bg-neutral-800 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Add Source */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-100">Add WinGet Package Source</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {validationError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
                {validationError}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-neutral-300 block mb-1">Source Name</label>
                <input
                  type="text"
                  value={sourceName}
                  onChange={e => setSourceName(e.target.value)}
                  placeholder="e.g. enterprise-internal"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-neutral-300 block mb-1">Repository Feed URL (HTTPS)</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={e => setSourceUrl(e.target.value)}
                  placeholder="https://packages.example.com/feed"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-100 focus:outline-none font-mono"
                />
              </div>

              <div className="p-3 rounded-lg bg-neutral-950 text-neutral-400 text-[11px] font-mono">
                Command: winget source add "{sourceName || '<name>'}" "{sourceUrl || '<url>'}"
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSource}
                className="px-4 py-1.5 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors"
              >
                Add & Verify Source
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
