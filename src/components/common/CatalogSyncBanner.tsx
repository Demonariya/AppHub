import React, { useState } from 'react';
import {
  CatalogCacheStats,
  CatalogSyncProgress,
  CatalogSyncResult,
  CatalogSyncRunRecord,
} from '../../types';
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  FileText,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { Button, Dialog, StatusBadge } from '../ui';
import { formatBytes } from '../../services/catalog';

interface CatalogSyncBannerProps {
  isSyncing: boolean;
  syncProgress: CatalogSyncProgress | null;
  lastSyncResult: CatalogSyncResult | null;
  syncHistory: CatalogSyncRunRecord[];
  catalogStats: CatalogCacheStats;
  onStartSync: (targetSources?: string[]) => void;
  onCancelSync: () => void;
  onAcceptAgreementsAndSync: () => void;
  compact?: boolean;
}

export const CatalogSyncLogDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  syncHistory: CatalogSyncRunRecord[];
  catalogStats: CatalogCacheStats;
}> = ({ isOpen, onClose, syncHistory, catalogStats }) => {
  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="WinGet Catalog Sync Log"
      subtitle="Recorded synchronization runs, source CLI commands, and cache diagnostics."
      maxWidthClass="max-w-3xl"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Indexed Packages</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
              {catalogStats.availablePackages}
            </div>
          </div>
          <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Enriched Metadata</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
              {catalogStats.enrichedPackages}
            </div>
          </div>
          <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">Last Complete Sync</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5 truncate">
              {catalogStats.lastSyncAt
                ? new Date(catalogStats.lastSyncAt).toLocaleString()
                : 'Never'}
            </div>
          </div>
          <div className="p-3 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)]">
            <div className="text-[var(--text-muted)]">SQLite Footprint</div>
            <div className="text-sm font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
              {catalogStats.dbSizeBytes > 0 ? formatBytes(catalogStats.dbSizeBytes) : '—'}
            </div>
          </div>
        </div>

        {syncHistory.length === 0 ? (
          <div className="p-6 text-center text-xs text-[var(--text-secondary)] bg-[var(--surface-subtle)] rounded-[10px] border border-[var(--border-subtle)]">
            No catalog synchronization runs recorded yet.
          </div>
        ) : (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            {syncHistory.map(run => (
              <div
                key={run.runId}
                className="p-3.5 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-mono">
                    <StatusBadge
                      status={
                        run.cancelled
                          ? 'cancelled'
                          : run.status === 'completed'
                          ? 'completed'
                          : run.status === 'partial'
                          ? 'update'
                          : 'failed'
                      }
                      label={run.status}
                      compact
                    />
                    <span className="text-[var(--text-primary)] font-semibold">
                      {new Date(run.startedAt).toLocaleString()}
                    </span>
                    {run.durationMs !== undefined && (
                      <span className="text-[var(--text-muted)] tabular-nums">
                        ({(run.durationMs / 1000).toFixed(1)}s)
                      </span>
                    )}
                  </div>

                  <div className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    {run.totalDiscovered} discovered · +{run.newlyDiscovered} new · ~{run.updatedRecords} updated · {run.unavailableRecords} unavailable
                  </div>
                </div>

                {run.error && (
                  <div className="text-[11px] font-mono text-[var(--status-danger-fg)] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[6px] p-2">
                    {run.error}
                  </div>
                )}

                {run.outcomes.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-[var(--border-subtle)]">
                    {run.outcomes.map((o, idx) => (
                      <div
                        key={`${run.runId}_${o.sourceName}_${idx}`}
                        className="p-2 rounded-[6px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {o.sourceName} ({o.status})
                            {!o.isComplete && o.status !== 'failed' ? ' · Partial' : ''}
                          </span>
                          <span className="text-[var(--text-muted)] tabular-nums">
                            {o.discoveredCount} rows · {(o.durationMs / 1000).toFixed(1)}s
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] break-all">
                          $ {o.commandExecuted}
                        </div>
                        {o.truncationReason && (
                          <div className="text-[11px] text-[var(--status-warning-fg)]">
                            Truncation notice: {o.truncationReason}
                          </div>
                        )}
                        {o.error && (
                          <div className="text-[11px] text-[var(--status-danger-fg)]">
                            Error: {o.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
};

export const CatalogSyncBanner: React.FC<CatalogSyncBannerProps> = ({
  isSyncing,
  syncProgress,
  lastSyncResult,
  syncHistory,
  catalogStats,
  onStartSync,
  onCancelSync,
  onAcceptAgreementsAndSync,
  compact = false,
}) => {
  const [logOpen, setLogOpen] = useState(false);

  const agreementRequired = Boolean(lastSyncResult?.agreementRequired && !isSyncing);
  const failedSources = lastSyncResult?.failedSources || [];
  const partialOutcomes = (lastSyncResult?.sourceOutcomes || []).filter(
    o => o.status === 'partial' || (!o.isComplete && o.status === 'completed')
  );
  const syncFailedTotally = Boolean(
    !isSyncing &&
      lastSyncResult &&
      !lastSyncResult.cancelled &&
      !lastSyncResult.agreementRequired &&
      lastSyncResult.succeededSources.length === 0 &&
      (failedSources.length > 0 || lastSyncResult.error)
  );
  const hasPartialOrFailed = Boolean(
    !isSyncing &&
      !syncFailedTotally &&
      !agreementRequired &&
      (failedSources.length > 0 || partialOutcomes.length > 0)
  );

  // If nothing noteworthy is happening and compact mode is requested without sync history warnings, stay minimal
  const showActive = isSyncing;
  const showWarning = agreementRequired || syncFailedTotally || hasPartialOrFailed;

  if (!showActive && !showWarning && compact) {
    return (
      <>
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-[10px] bg-[var(--surface-panel)] border border-[var(--border-subtle)] text-xs">
          <div className="flex flex-wrap items-center gap-2 text-[var(--text-secondary)]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--status-success-fg)] shrink-0" />
            <span className="font-mono tabular-nums text-[var(--text-primary)] font-medium">
              {catalogStats.availablePackages} packages cached
            </span>
            {catalogStats.lastSyncAt && (
              <span className="text-[var(--text-muted)] font-mono">
                · Last synced {new Date(catalogStats.lastSyncAt).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FileText className="w-3.5 h-3.5" />}
              onClick={() => setLogOpen(true)}
            >
              Sync Log
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => onStartSync()}
            >
              Sync Now
            </Button>
          </div>
        </div>
        <CatalogSyncLogDialog
          isOpen={logOpen}
          onClose={() => setLogOpen(false)}
          syncHistory={syncHistory}
          catalogStats={catalogStats}
        />
      </>
    );
  }

  return (
    <>
      {showActive && (
        <div className="p-3.5 rounded-[12px] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <RefreshCw className="w-4 h-4 text-[var(--accent-primary)] animate-spin shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {syncProgress?.message || 'Synchronizing WinGet catalog...'}
              </div>
              <div className="text-[11px] font-mono text-[var(--text-secondary)] mt-0.5 tabular-nums">
                {syncProgress?.currentSource
                  ? `Source: ${syncProgress.currentSource} (${syncProgress.sourcesCompleted}/${Math.max(1, syncProgress.sourcesTotal)})`
                  : 'Querying configured WinGet sources'}
                {syncProgress && syncProgress.packagesDiscovered > 0
                  ? ` · ${syncProgress.packagesDiscovered} packages discovered`
                  : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<FileText className="w-3.5 h-3.5" />}
              onClick={() => setLogOpen(true)}
            >
              Sync Log
            </Button>
            <Button
              size="sm"
              variant="danger"
              leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={onCancelSync}
            >
              Cancel Sync
            </Button>
          </div>
        </div>
      )}

      {agreementRequired && (
        <div className="p-4 rounded-[12px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-4 h-4 text-[var(--status-warning-fg)] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                WinGet Source Agreements Confirmation Required
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                Microsoft WinGet requires accepting source repository agreements before listing packages from configured sources.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="warning" onClick={onAcceptAgreementsAndSync}>
              Accept Agreements &amp; Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLogOpen(true)}>
              Sync Log
            </Button>
          </div>
        </div>
      )}

      {syncFailedTotally && (
        <div className="p-4 rounded-[12px] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <WifiOff className="w-4 h-4 text-[var(--status-danger-fg)] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-[var(--text-primary)]">
                Catalog Sync Unavailable — Using Last Cached State
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {lastSyncResult?.error ||
                  `Failed to sync source${failedSources.length === 1 ? '' : 's'}: ${failedSources.join(', ')}.`}
                {catalogStats.availablePackages > 0
                  ? ` Showing ${catalogStats.availablePackages} previously cached packages.`
                  : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              onClick={() => onStartSync()}
            >
              Retry Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLogOpen(true)}>
              Sync Log
            </Button>
          </div>
        </div>
      )}

      {hasPartialOrFailed && (
        <div className="p-3.5 rounded-[12px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[var(--status-warning-fg)] shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-semibold text-[var(--text-primary)]">
                Partial Catalog Synchronization
              </div>
              <p className="text-[var(--text-secondary)] mt-0.5">
                {failedSources.length > 0 && `Failed sources: ${failedSources.join(', ')}. `}
                {partialOutcomes.length > 0 &&
                  partialOutcomes
                    .map(o => `${o.sourceName}: ${o.truncationReason || 'truncated output'}`)
                    .join('; ')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {failedSources.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                onClick={() => onStartSync(failedSources)}
              >
                Retry Failed
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setLogOpen(true)}>
              Sync Log
            </Button>
          </div>
        </div>
      )}

      <CatalogSyncLogDialog
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        syncHistory={syncHistory}
        catalogStats={catalogStats}
      />
    </>
  );
};
