import React, { useState } from 'react';
import { Package, TaskAction, CustomCollection } from '../types';
import { AppCard } from '../components/common/AppCard';
import {
  Bookmark,
  Heart,
  Layers,
  Download,
  Upload,
  Plus,
  Trash2,
  Share2,
  FileJson,
  Check,
  RotateCcw,
} from 'lucide-react';
import { storage } from '../services/storage';

interface LibraryPageProps {
  packages: Package[];
  collections: CustomCollection[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onUpdateCollections: (collections: CustomCollection[]) => void;
  onExportManifest: () => void;
  onImportManifest: (jsonString: string) => void;
  onRestoreBackup: (backupJson: string) => void;
}

export const LibraryPage: React.FC<LibraryPageProps> = ({
  packages,
  collections,
  onOpenDetails,
  onActionClick,
  onUpdateCollections,
  onExportManifest,
  onImportManifest,
  onRestoreBackup,
}) => {
  const [activeTab, setActiveTab] = useState<'favorites' | 'collections' | 'backup'>('favorites');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDesc, setNewCollectionDesc] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const favorites = packages.filter(p => p.isFavorite);

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;
    const created: CustomCollection = {
      id: `col_${Date.now()}`,
      name: newCollectionName.trim(),
      description: newCollectionDesc.trim() || 'Custom software bundle',
      iconName: 'Layers',
      packageIds: [],
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
    };
    const next = [...collections, created];
    storage.saveCollections(next);
    onUpdateCollections(next);
    setNewCollectionName('');
    setNewCollectionDesc('');
    setShowCreateModal(false);
  };

  const handleDeleteCollection = (id: string) => {
    const next = collections.filter(c => c.id !== id);
    storage.saveCollections(next);
    onUpdateCollections(next);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'manifest' | 'backup') => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
      const content = event.target?.result as string;
      if (type === 'manifest') {
        try {
          const res = storage.importWinGetManifest(content);
          setImportStatus(`Successfully parsed manifest with ${res.importedCount} package references!`);
          setTimeout(() => setImportStatus(null), 4000);
          onImportManifest(content);
        } catch (err) {
          setImportStatus(`Import failed: ${(err as Error).message}`);
          setTimeout(() => setImportStatus(null), 4000);
        }
      } else {
        const success = storage.restoreFullBackup(content);
        if (success) {
          onRestoreBackup(content);
          setImportStatus('Backup restored successfully!');
          setTimeout(() => setImportStatus(null), 4000);
        } else {
          setImportStatus('Backup format invalid.');
          setTimeout(() => setImportStatus(null), 4000);
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
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Software Library</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Manage your personal collections, favorites, and WinGet manifest exports.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 p-1 bg-neutral-900 border border-neutral-800 rounded-lg">
          <button
            onClick={() => setActiveTab('favorites')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'favorites' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Favorites ({favorites.length})
          </button>
          <button
            onClick={() => setActiveTab('collections')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'collections' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Collections ({collections.length})
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'backup' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Import & Export
          </button>
        </div>
      </div>

      {importStatus && (
        <div className="p-3 bg-sky-950/40 border border-sky-800/60 rounded-xl text-xs text-sky-300 font-mono">
          {importStatus}
        </div>
      )}

      {/* Tab 1: Favorites */}
      {activeTab === 'favorites' && (
        <div className="space-y-4">
          {favorites.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {favorites.map(pkg => (
                <AppCard
                  key={pkg.id}
                  pkg={pkg}
                  onOpenDetails={onOpenDetails}
                  onActionClick={onActionClick}
                />
              ))}
            </div>
          ) : (
            <div className="py-20 text-center space-y-2 bg-neutral-900/30 rounded-2xl border border-neutral-800/60 p-8">
              <Heart className="w-10 h-10 text-neutral-600 mx-auto" />
              <p className="text-sm text-neutral-300">No favorite packages yet</p>
              <p className="text-xs text-neutral-500">Star applications in the store to pin them here for rapid installation.</p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Custom Collections */}
      {activeTab === 'collections' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="text-xs text-neutral-400">
              Group software into tailored bundles for quick batch setup on new machines.
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Create Collection</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {collections.map(col => {
              const colPkgs = packages.filter(p => col.packageIds.includes(p.id));

              return (
                <div
                  key={col.id}
                  className="bg-neutral-900/70 border border-neutral-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div className="w-9 h-9 rounded-lg bg-neutral-800 flex items-center justify-center text-sky-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <button
                        onClick={() => handleDeleteCollection(col.id)}
                        title="Delete collection"
                        className="text-neutral-500 hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <h3 className="text-sm font-semibold text-neutral-100">{col.name}</h3>
                    <p className="text-xs text-neutral-400 line-clamp-2">{col.description}</p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-neutral-800/80">
                    <div className="text-[11px] font-mono text-neutral-500">
                      {colPkgs.length} packages included:
                    </div>
                    <div className="space-y-1">
                      {colPkgs.slice(0, 4).map(p => (
                        <div
                          key={p.id}
                          onClick={() => onOpenDetails(p)}
                          className="flex items-center justify-between text-xs text-neutral-300 hover:text-sky-400 cursor-pointer py-0.5"
                        >
                          <span className="truncate">{p.name}</span>
                          <span className="text-[10px] font-mono text-neutral-500">v{p.latestVersion}</span>
                        </div>
                      ))}
                      {colPkgs.length > 4 && (
                        <div className="text-[11px] text-neutral-500 font-mono">
                          +{colPkgs.length - 4} more software
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Backup & Restore & WinGet Export/Import */}
      {activeTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* WinGet Native Manifest Export/Import */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <FileJson className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">WinGet Manifest Sync</h3>
                <p className="text-xs text-neutral-400">Official winget export & winget import format</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Export your installed software packages into a standard Microsoft WinGet schema JSON file (<code className="text-sky-400">winget-packages.schema.2.0.json</code>) or import an existing manifest to recreate an environment on any Windows device.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={onExportManifest}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                <span>Export WinGet Manifest</span>
              </button>

              <label className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Import WinGet Manifest</span>
                <input
                  type="file"
                  accept=".json,.txt"
                  className="hidden"
                  onChange={e => handleFileUpload(e, 'manifest')}
                />
              </label>
            </div>
          </div>

          {/* Full AppHub Backup */}
          <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-neutral-100">Complete AppHub Backup</h3>
                <p className="text-xs text-neutral-400">Collections, settings, sources & history</p>
              </div>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Create an immutable snapshot of all custom bundles, configured repository sources, preferences, and telemetry logs.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                onClick={handleDownloadBackup}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>Download Backup</span>
              </button>

              <label className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg transition-colors cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span>Restore Backup</span>
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

      {/* Modal: Create Collection */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-neutral-100">Create New Collection</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Collection Name</label>
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={e => setNewCollectionName(e.target.value)}
                  placeholder="e.g. Media Editing Suite"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Description</label>
                <textarea
                  value={newCollectionDesc}
                  onChange={e => setNewCollectionDesc(e.target.value)}
                  placeholder="Short description of this collection..."
                  rows={3}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-100 focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg disabled:opacity-50 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
