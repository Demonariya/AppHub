import React, { useState, useMemo } from 'react';
import { Package, TaskAction, CustomCollection } from '../types';
import { AppCard } from '../components/common/AppCard';
import { AppIconImage } from '../components/common/AppIconImage';
import {
  Heart,
  Layers,
  Download,
  Upload,
  Plus,
  Trash2,
  Share2,
  FileJson,
  Check,
  Edit3,
} from 'lucide-react';
import { storage } from '../services/storage';
import {
  PageHeader,
  SegmentedTabs,
  SearchInput,
  FilterSelect,
  Button,
  EmptyState,
  Dialog,
  ConfirmationDialog,
  useToast,
} from '../components/ui';

interface LibraryPageProps {
  packages: Package[];
  collections: CustomCollection[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction, options?: any) => void;
  onToggleFavorite?: (pkg: Package) => void;
  onUpdateCollections: (collections: CustomCollection[]) => void;
  onExportManifest: () => void;
  onImportManifest: (jsonString: string) => void;
  onRestoreBackup: (backupJson: string) => void;
  onInstallCollection?: (pkgs: Package[]) => void;
  onNavigateToDiscover?: () => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  packages,
  collections,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  onUpdateCollections,
  onExportManifest,
  onImportManifest,
  onRestoreBackup,
  onInstallCollection,
  onNavigateToDiscover,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'favorites' | 'collections' | 'backup'>('favorites');
  const [favoriteQuery, setFavoriteQuery] = useState('');
  const [favoriteSort, setFavoriteSort] = useState<'name' | 'installed'>('name');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null);
  const [deletingCollection, setDeletingCollection] = useState<CustomCollection | null>(null);
  const [collectionPkgFilter, setCollectionPkgFilter] = useState('');

  const allFavorites = useMemo(() => packages.filter(p => p.isFavorite), [packages]);

  const favorites = useMemo(() => {
    const filtered = allFavorites.filter(p => {
      if (!favoriteQuery.trim()) return true;
      const q = favoriteQuery.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.publisher.toLowerCase().includes(q)
      );
    });
    return [...filtered].sort((a, b) => {
      if (favoriteSort === 'installed') {
        const ai = a.isInstalled ? 0 : 1;
        const bi = b.isInstalled ? 0 : 1;
        if (ai !== bi) return ai - bi;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allFavorites, favoriteQuery, favoriteSort]);

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const created: CustomCollection = {
      id: `col_${Date.now()}`,
      name: newCollectionName.trim(),
      description: newCollectionDesc.trim() || 'Custom software bundle',
      iconName: 'Layers',
      packageIds: [],
      createdAt: today,
      updatedAt: today,
    };
    const next = [...collections, created];
    storage.saveCollections(next);
    onUpdateCollections(next);
    setNewCollectionName('');
    setNewCollectionDesc('');
    setShowCreateModal(false);
    setEditingCollectionId(created.id);
    showToast({ title: 'Collection Created', description: created.name, tone: 'success' });
  };

  const handleConfirmDeleteCollection = () => {
    if (!deletingCollection) return;
    const next = collections.filter(c => c.id !== deletingCollection.id);
    storage.saveCollections(next);
    onUpdateCollections(next);
    if (editingCollectionId === deletingCollection.id) {
      setEditingCollectionId(null);
    }
    showToast({ title: 'Collection Removed', description: deletingCollection.name, tone: 'info' });
    setDeletingCollection(null);
  };

  const handleTogglePackageInCollection = (colId: string, packageId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const next = collections.map(col => {
      if (col.id !== colId) return col;
      const exists = col.packageIds.includes(packageId);
      return {
        ...col,
        packageIds: exists
          ? col.packageIds.filter(id => id !== packageId)
          : [...col.packageIds, packageId],
        updatedAt: today,
      };
    });
    storage.saveCollections(next);
    onUpdateCollections(next);
  };

  const handleInstallCollectionApps = (missingPkgs: Package[]) => {
    if (missingPkgs.length === 0) return;
    if (onInstallCollection) {
      onInstallCollection(missingPkgs);
    } else {
      for (const pkg of missingPkgs) {
        onActionClick(pkg, 'install', { forceBypassUac: true });
      }
    }
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'manifest' | 'backup'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (type === 'manifest') {
        try {
          const res = storage.importWinGetManifest(content);
          onImportManifest(content);
          showToast({
            title: 'WinGet Manifest Imported',
            description: `Starred ${res.importedCount} packages from manifest.`,
            tone: 'success',
          });
        } catch (err) {
          showToast({
            title: 'Manifest Import Failed',
            description: (err as Error).message,
            tone: 'error',
          });
        }
      } else {
        const success = storage.restoreFullBackup(content);
        if (success) {
          onRestoreBackup(content);
          showToast({ title: 'Backup Restored', tone: 'success' });
        } else {
          showToast({
            title: 'Invalid Backup File',
            description: 'The selected file is not a valid AppHub snapshot.',
            tone: 'error',
          });
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadBackup = () => {
    const backupJson = storage.createFullBackup();
    const blob = new Blob([backupJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `apphub_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast({ title: 'Backup Downloaded', tone: 'success' });
  };

  const editingCollection = collections.find(c => c.id === editingCollectionId) || null;
  const catalogForPicker = packages
    .filter(p => !p.isExternal)
    .filter(p => {
      if (!collectionPkgFilter.trim()) return true;
      const q = collectionPkgFilter.toLowerCase().trim();
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Software Library"
        subtitle="Manage starred favorites, custom workstation setup collections, and WinGet manifest backups."
        actions={
          <SegmentedTabs
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="Library sections"
            options={[
              { id: 'favorites', label: 'Favorites', count: allFavorites.length },
              { id: 'collections', label: 'Collections', count: collections.length },
              { id: 'backup', label: 'Import & Export' },
            ]}
          />
        }
      />

      {/* Tab 1: Favorites */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          {allFavorites.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <SearchInput
                value={favoriteQuery}
                onChange={setFavoriteQuery}
                placeholder="Filter favorite packages..."
                className="max-w-sm flex-1"
              />
              <FilterSelect
                label="Sort"
                value={favoriteSort}
                onChange={v => setFavoriteSort(v as 'name' | 'installed')}
                options={[
                  { value: 'name', label: 'Name (A–Z)' },
                  { value: 'installed', label: 'Installed First' },
                ]}
              />
            </div>
          )}

          {favorites.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {favorites.map(pkg => (
                <AppCard
                  key={pkg.id}
                  pkg={pkg}
                  onOpenDetails={onOpenDetails}
                  onActionClick={onActionClick}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Heart className="w-5 h-5" />}
              title={favoriteQuery ? 'No Matching Favorites' : 'No Favorite Packages Yet'}
              description={
                favoriteQuery
                  ? 'Clear your search filter to view all starred packages.'
                  : 'Star any application in Explore or Details to bookmark it here for quick installation.'
              }
              action={
                favoriteQuery ? (
                  <Button size="sm" variant="secondary" onClick={() => setFavoriteQuery('')}>
                    Clear Search
                  </Button>
                ) : onNavigateToDiscover ? (
                  <Button size="sm" variant="primary" onClick={onNavigateToDiscover}>
                    Explore Packages
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      )}

      {/* Tab 2: Collections */}
      {activeTab === 'collections' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-secondary)]">
              Group software into tailored bundles for batch setup on Windows workstations.
            </p>
            <Button
              size="md"
              variant="primary"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => setShowCreateModal(true)}
            >
              Create Collection
            </Button>
          </div>

          {collections.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collections.map(col => {
                const colPkgs = packages.filter(p => col.packageIds.includes(p.id));
                const missingPkgs = colPkgs.filter(p => !p.isInstalled && !p.isExternal);

                return (
                  <div
                    key={col.id}
                    className="bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[12px] p-5 flex flex-col justify-between space-y-4 shadow-[var(--shadow-card)]"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="w-9 h-9 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)]">
                          <Layers className="w-4 h-4" />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setCollectionPkgFilter('');
                              setEditingCollectionId(col.id);
                            }}
                            aria-label={`Edit packages in ${col.name}`}
                            title="Edit packages in collection"
                            className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--accent-primary)] hover:bg-[var(--surface-hover)] cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingCollection(col)}
                            aria-label={`Delete collection ${col.name}`}
                            title="Delete collection"
                            className="p-1.5 rounded-[6px] text-[var(--text-muted)] hover:text-[var(--status-danger-fg)] hover:bg-[var(--surface-hover)] cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{col.name}</h3>
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                        {col.description}
                      </p>
                    </div>

                    <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
                      <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                        <span>{colPkgs.length} packages</span>
                        <span>{colPkgs.length - missingPkgs.length} installed</span>
                      </div>

                      <div className="space-y-1">
                        {colPkgs.slice(0, 4).map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => onOpenDetails(p)}
                            className="w-full flex items-center justify-between text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)] py-0.5 cursor-pointer text-left"
                          >
                            <span className="truncate flex items-center gap-1.5">
                              {p.isInstalled && (
                                <Check className="w-3 h-3 text-[var(--status-success-fg)] shrink-0" />
                              )}
                              <span className="truncate">{p.name}</span>
                            </span>
                            <span className="text-[10px] font-mono text-[var(--text-muted)] shrink-0 tabular-nums">
                              v{p.installedVersion || p.latestVersion}
                            </span>
                          </button>
                        ))}
                        {colPkgs.length > 4 && (
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">
                            +{colPkgs.length - 4} more packages
                          </div>
                        )}
                        {colPkgs.length === 0 && (
                          <div className="text-[11px] text-[var(--text-muted)] italic">
                            No packages assigned yet. Click Edit to add software.
                          </div>
                        )}
                      </div>

                      <Button
                        size="md"
                        variant="primary"
                        className="w-full"
                        disabled={missingPkgs.length === 0}
                        leftIcon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => handleInstallCollectionApps(missingPkgs)}
                      >
                        {missingPkgs.length > 0
                          ? `Install Missing (${missingPkgs.length})`
                          : 'All Installed'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={<Layers className="w-5 h-5" />}
              title="No Saved Collections"
              description="Create a collection to group software bundles for repeatable workstation setup."
              action={
                <Button size="md" variant="primary" onClick={() => setShowCreateModal(true)}>
                  Create First Collection
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Tab 3: Manifest & Backup */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-6 bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[12px] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center text-[var(--accent-primary)]">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  WinGet Manifest Sync
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Official winget export &amp; winget import schema
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Export your WinGet-managed software into a standard Microsoft WinGet schema JSON file (
              <code className="text-[var(--accent-primary)]">winget-packages.schema.2.0.json</code>) or import an existing manifest.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <Button
                size="md"
                variant="secondary"
                leftIcon={<Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                onClick={onExportManifest}
              >
                Export Manifest
              </Button>

              <label className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-medium text-[var(--text-primary)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] rounded-[8px] transition-colors cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Import Manifest</span>
                <input
                  type="file"
                  accept=".json,.txt"
                  className="hidden"
                  onChange={e => handleFileUpload(e, 'manifest')}
                />
              </label>
            </div>
          </div>

          <div className="p-6 bg-[var(--surface-panel)] border border-[var(--border-subtle)] rounded-[12px] space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--accent-primary)]">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Complete AppHub Snapshot
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Collections, favorites, preferences &amp; history
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Create a portable snapshot of all custom collections, favorites, configured sources, preferences, and installation history.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <Button
                size="md"
                variant="secondary"
                leftIcon={<Download className="w-3.5 h-3.5 text-[var(--accent-primary)]" />}
                onClick={handleDownloadBackup}
              >
                Download Snapshot
              </Button>

              <label className="inline-flex items-center gap-1.5 h-8 px-3.5 text-xs font-medium text-[var(--text-primary)] bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)] border border-[var(--border-strong)] rounded-[8px] transition-colors cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Restore Snapshot</span>
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={e => handleFileUpload(e, 'backup')}
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Dialog: Create Collection */}
      <Dialog
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Collection"
        subtitle="Group WinGet packages into a reusable setup list."
        maxWidthClass="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim()}
            >
              Create Collection
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-xs">
          <div>
            <label className="text-[var(--text-secondary)] block mb-1 font-medium">
              Collection Name
            </label>
            <input
              type="text"
              value={newCollectionName}
              onChange={e => setNewCollectionName(e.target.value)}
              placeholder="e.g. Workstation Developer Kit"
              className="w-full h-9 px-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[var(--text-secondary)] block mb-1 font-medium">
              Description
            </label>
            <textarea
              value={newCollectionDesc}
              onChange={e => setNewCollectionDesc(e.target.value)}
              placeholder="Short description of this bundle..."
              rows={3}
              className="w-full p-3 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none"
            />
          </div>
        </div>
      </Dialog>

      {/* Dialog: Manage Collection Packages */}
      <Dialog
        isOpen={Boolean(editingCollection)}
        onClose={() => setEditingCollectionId(null)}
        title={editingCollection ? `Manage Packages — ${editingCollection.name}` : ''}
        subtitle={
          editingCollection
            ? `${editingCollection.packageIds.length} package${editingCollection.packageIds.length === 1 ? '' : 's'} selected`
            : ''
        }
        maxWidthClass="max-w-lg"
        footer={
          <Button variant="primary" onClick={() => setEditingCollectionId(null)}>
            Done
          </Button>
        }
      >
        {editingCollection && (
          <div className="space-y-3">
            <SearchInput
              value={collectionPkgFilter}
              onChange={setCollectionPkgFilter}
              placeholder="Filter catalog packages..."
            />

            <div className="max-h-72 overflow-y-auto rounded-[10px] border border-[var(--border-subtle)] divide-y divide-[var(--border-subtle)] bg-[var(--surface-subtle)]">
              {catalogForPicker.map(pkg => {
                const checked = editingCollection.packageIds.includes(pkg.id);
                return (
                  <label
                    key={pkg.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-[var(--surface-hover)] cursor-pointer text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          handleTogglePackageInCollection(editingCollection.id, pkg.id)
                        }
                        className="w-3.5 h-3.5 rounded accent-[var(--accent-primary)] cursor-pointer shrink-0"
                      />
                      <AppIconImage pkg={pkg} size="sm" />
                      <span className="text-[var(--text-primary)] font-medium truncate">
                        {pkg.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono text-[var(--text-muted)] shrink-0">
                      {pkg.id}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmationDialog
        isOpen={Boolean(deletingCollection)}
        onCancel={() => setDeletingCollection(null)}
        onConfirm={handleConfirmDeleteCollection}
        title="Delete Collection"
        description={
          deletingCollection
            ? `Remove "${deletingCollection.name}" from your saved collections? Installed packages on your PC will not be affected.`
            : ''
        }
        confirmLabel="Delete Collection"
        tone="danger"
      />
    </div>
  );
};
