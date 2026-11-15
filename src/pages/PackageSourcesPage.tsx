import React, { useState } from 'react';
import { PackageSource } from '../types';
import {
  Database,
  Plus,
  RefreshCw,
  Trash2,
  RotateCcw,
  ShieldCheck,
  Copy,
} from 'lucide-react';
import { storage } from '../services/storage';
import { wingetEngine } from '../services/wingetEngine';
import {
  PageHeader,
  Button,
  StatusBadge,
  ErrorState,
  Dialog,
  ConfirmationDialog,
  useToast,
} from '../components/ui';

interface PackageSourcesPageProps {
  sources: PackageSource[];
  onUpdateSources: (sources: PackageSource[]) => void;
  onRefreshAllSources?: () => Promise<void> | void;
  isRefreshing?: boolean;
}

export const PackageSourcesPage: React.FC<PackageSourcesPageProps> = ({
  sources,
  onUpdateSources,
  onRefreshAllSources,
  isRefreshing = false,
}) => {
  const { showToast } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sourceToRemove, setSourceToRemove] = useState<PackageSource | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const reloadSourcesFromWinGet = async () => {
    const live = await wingetEngine.getSources();
    const mapped: PackageSource[] = live.map(s => ({
      id: s.name.toLowerCase(),
      name: s.name,
      arg: s.argument,
      type: s.name === 'msstore' ? 'msstore' : s.name === 'winget' ? 'winget' : 'custom',
      isOfficial: s.isOfficial,
      trustLevel: s.isOfficial ? 'verified' : 'community',
    }));
    storage.saveSources(mapped);
    onUpdateSources(mapped);
  };

  const handleUpdateSources = async () => {
    setActionError(null);
    setBusyAction('update');
    try {
      await wingetEngine.updateSources();
      await reloadSourcesFromWinGet();
      if (onRefreshAllSources) {
        await onRefreshAllSources();
      }
      showToast({ title: 'WinGet Sources Updated', tone: 'success' });
    } catch (err: any) {
      setActionError(err?.message || String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveSource = async () => {
    if (!sourceToRemove) return;
    const target = sourceToRemove;
    setSourceToRemove(null);
    setActionError(null);
    setBusyAction(`remove:${target.id}`);
    try {
      await wingetEngine.removeSource(target.name);
      await reloadSourcesFromWinGet();
      showToast({ title: 'Source Removed', description: target.name, tone: 'info' });
    } catch (err: any) {
      setActionError(err?.message || String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleResetToDefault = async () => {
    setActionError(null);
    setBusyAction('reset');
    setConfirmReset(false);
    try {
      await wingetEngine.resetSources();
      await reloadSourcesFromWinGet();
      showToast({ title: 'WinGet Sources Reset', tone: 'success' });
    } catch (err: any) {
      setActionError(err?.message || String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleAddSource = async () => {
    setValidationError(null);
    setActionError(null);

    const trimmedName = sourceName.trim();
    const trimmedUrl = sourceUrl.trim();

    if (!trimmedName || !trimmedUrl) {
      setValidationError('Please provide both a source name and HTTPS repository URL.');
      return;
    }

    if (!/^[A-Za-z0-9._-]+$/.test(trimmedName)) {
      setValidationError(
        'Source name may only contain letters, numbers, dots, underscores, or hyphens.'
      );
      return;
    }

    if (!trimmedUrl.startsWith('https://')) {
      setValidationError('Source URL must use HTTPS.');
      return;
    }

    if (sources.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
      setValidationError(`A source named "${trimmedName}" already exists.`);
      return;
    }

    setBusyAction('add');
    try {
      await wingetEngine.addSource(trimmedName, trimmedUrl);
      await reloadSourcesFromWinGet();
      setSourceName('');
      setSourceUrl('');
      setShowAddModal(false);
      showToast({ title: 'Package Source Added', description: trimmedName, tone: 'success' });
    } catch (err: any) {
      setValidationError(err?.message || String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const busy = busyAction !== null || isRefreshing;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Package Sources"
        subtitle="Configure upstream package repositories queried by Microsoft WinGet."
        actions={
          <>
            <Button
              size="md"
              variant="secondary"
              onClick={handleUpdateSources}
              disabled={busy}
              leftIcon={
                <RefreshCw
                  className={`w-3.5 h-3.5 ${
                    busyAction === 'update' || isRefreshing
                      ? 'animate-spin text-[var(--accent-primary)]'
                      : ''
                  }`}
                />
              }
            >
              {busyAction === 'update' ? 'Updating...' : 'Update Sources'}
            </Button>

            <Button
              size="md"
              variant="secondary"
              onClick={() => setConfirmReset(true)}
              disabled={busy}
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Reset Defaults
            </Button>

            <Button
              size="md"
              variant="primary"
              onClick={() => {
                setValidationError(null);
                setShowAddModal(true);
              }}
              disabled={busy}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Source
            </Button>
          </>
        }
      />

      {actionError && (
        <ErrorState
          title="Source Operation Failed"
          message={actionError}
          onDismiss={() => setActionError(null)}
        />
      )}

      <div className="p-4 rounded-[10px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] flex items-start gap-3 text-xs text-[var(--text-secondary)]">
        <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          Official sources (<code className="font-mono text-[var(--accent-primary)]">winget</code> and{' '}
          <code className="font-mono text-[var(--accent-primary)]">msstore</code>) are maintained by Microsoft. Custom repositories execute native{' '}
          <code className="font-mono text-[var(--text-primary)]">winget source</code> commands and should only be added from trusted organizations.
        </p>
      </div>

      {/* Sources List */}
      <div className="space-y-3">
        {sources.map(source => {
          const isRemoving = busyAction === `remove:${source.id}`;
          return (
            <div
              key={source.id}
              className="p-5 rounded-[12px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-10 h-10 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                  <Database className="w-5 h-5 text-[var(--accent-primary)]" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-[var(--text-primary)]">
                      {source.name}
                    </span>
                    <StatusBadge
                      status={source.isOfficial ? 'verified' : 'community'}
                      label={source.isOfficial ? 'Official Microsoft' : 'Custom Source'}
                      compact
                    />
                  </div>

                  <div className="text-xs font-mono text-[var(--text-secondary)] truncate mt-1 flex items-center gap-2">
                    <span className="truncate">{source.arg}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(source.arg);
                        showToast({ title: 'Endpoint Copied', description: source.arg, tone: 'info' });
                      }}
                      aria-label={`Copy endpoint URL for ${source.name}`}
                      className="text-[var(--text-muted)] hover:text-[var(--accent-primary)] cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              {!source.isOfficial && (
                <Button
                  size="sm"
                  variant="danger"
                  loading={isRemoving}
                  disabled={busy}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                  onClick={() => setSourceToRemove(source)}
                >
                  Remove
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Source Dialog */}
      <Dialog
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add WinGet Package Source"
        subtitle="Register an HTTPS WinGet source repository."
        maxWidthClass="max-w-lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={busyAction === 'add'}
              onClick={handleAddSource}
            >
              Add &amp; Verify Source
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          {validationError && <ErrorState title="Validation Error" message={validationError} />}

          <div>
            <label className="text-[var(--text-secondary)] block mb-1 font-medium">
              Source Name
            </label>
            <input
              type="text"
              value={sourceName}
              onChange={e => setSourceName(e.target.value)}
              placeholder="e.g. enterprise-internal"
              className="w-full h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[var(--text-secondary)] block mb-1 font-medium">
              Repository Feed URL (HTTPS)
            </label>
            <input
              type="url"
              value={sourceUrl}
              onChange={e => setSourceUrl(e.target.value)}
              placeholder="https://packages.example.com/feed"
              className="w-full h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>

          <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[11px] font-mono break-all">
            winget source add --name &quot;{sourceName || '<name>'}&quot; --arg &quot;
            {sourceUrl || '<url>'}&quot;
          </div>
        </div>
      </Dialog>

      <ConfirmationDialog
        isOpen={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={handleResetToDefault}
        title="Reset Package Sources"
        description="Restore WinGet sources back to Microsoft defaults (winget & msstore) and remove custom sources?"
        confirmLabel="Reset Sources"
        tone="danger"
      />

      <ConfirmationDialog
        isOpen={Boolean(sourceToRemove)}
        onCancel={() => setSourceToRemove(null)}
        onConfirm={handleRemoveSource}
        title="Remove Package Source"
        description={
          sourceToRemove
            ? `Execute winget source remove for "${sourceToRemove.name}"?`
            : ''
        }
        confirmLabel="Remove Source"
        tone="danger"
      />
    </div>
  );
};
