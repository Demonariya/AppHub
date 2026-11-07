import React, { useState, useMemo } from 'react';
import { Package, TaskAction, Architecture, PackageSourceType, CategoryType } from '../types';
import { AppCard } from '../components/common/AppCard';
import { AppListItem } from '../components/common/AppListItem';
import { CATEGORIES_LIST } from '../services/catalog';
import {
  Search,
  Filter,
  SlidersHorizontal,
  LayoutGrid,
  List,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

interface DiscoverPageProps {
  packages: Package[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  initialCategory?: CategoryType | null;
}

export const DiscoverPage: React.FC<DiscoverPageProps> = ({
  packages,
  onOpenDetails,
  onActionClick,
  initialCategory = null,
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory || 'All');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedArch, setSelectedArch] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'relevance' | 'name' | 'rating' | 'releaseDate'>('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const filtered = useMemo(() => {
    let result = [...packages];

    // Search query
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        p =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.publisher.toLowerCase().includes(q) ||
          p.tags.some(t => t.toLowerCase().includes(q)) ||
          p.description.toLowerCase().includes(q)
      );
    }

    // Category
    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }

    // Source
    if (selectedSource !== 'all') {
      result = result.filter(p => p.source === selectedSource);
    }

    // Architecture
    if (selectedArch !== 'all') {
      result = result.filter(p => p.architectures.includes(selectedArch as Architecture));
    }

    // Status
    if (selectedStatus === 'installed') {
      result = result.filter(p => p.isInstalled);
    } else if (selectedStatus === 'available') {
      result = result.filter(p => !p.isInstalled);
    } else if (selectedStatus === 'updates') {
      result = result.filter(
        p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'rating') return b.ratingCount - a.ratingCount;
      if (sortBy === 'releaseDate') return b.releaseDate.localeCompare(a.releaseDate);
      return 0; // relevance keeps original order
    });

    return result;
  }, [packages, query, selectedCategory, selectedSource, selectedArch, selectedStatus, sortBy]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const paginated = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleResetFilters = () => {
    setQuery('');
    setSelectedCategory('All');
    setSelectedSource('all');
    setSelectedArch('all');
    setSelectedStatus('all');
    setSortBy('relevance');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    query ||
    selectedCategory !== 'All' ||
    selectedSource !== 'all' ||
    selectedArch !== 'all' ||
    selectedStatus !== 'all' ||
    sortBy !== 'relevance';

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Filter by application name, package ID, publisher, or tags..."
              className="w-full pl-10 pr-4 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-xs text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-neutral-700 transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* View Mode Toggle & Sort */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-300 rounded-lg px-3 py-2 focus:outline-none"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="name">Sort: Name (A-Z)</option>
              <option value="rating">Sort: Popularity</option>
              <option value="releaseDate">Sort: Release Date</option>
            </select>

            <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={`p-1.5 rounded text-neutral-400 transition-colors ${
                  viewMode === 'grid' ? 'bg-neutral-800 text-white' : 'hover:text-neutral-200'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List view"
                className={`p-1.5 rounded text-neutral-400 transition-colors ${
                  viewMode === 'list' ? 'bg-neutral-800 text-white' : 'hover:text-neutral-200'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Filter controls strip */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400 pt-1">
          {/* Category Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">Category:</span>
            <select
              value={selectedCategory}
              onChange={e => {
                setSelectedCategory(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md px-2.5 py-1 focus:outline-none"
            >
              <option value="All">All Categories</option>
              {CATEGORIES_LIST.map(cat => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Source Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">Source:</span>
            <select
              value={selectedSource}
              onChange={e => {
                setSelectedSource(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md px-2.5 py-1 focus:outline-none font-mono"
            >
              <option value="all">All Sources</option>
              <option value="winget">winget (official)</option>
              <option value="msstore">msstore</option>
            </select>
          </div>

          {/* Architecture Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">Arch:</span>
            <select
              value={selectedArch}
              onChange={e => {
                setSelectedArch(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md px-2.5 py-1 focus:outline-none font-mono uppercase"
            >
              <option value="all">Any Architecture</option>
              <option value="x64">x64 (AMD64)</option>
              <option value="arm64">ARM64</option>
              <option value="x86">x86 (32-bit)</option>
            </select>
          </div>

          {/* Status Dropdown */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500">Status:</span>
            <select
              value={selectedStatus}
              onChange={e => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="bg-neutral-900 border border-neutral-800 text-xs text-neutral-200 rounded-md px-2.5 py-1 focus:outline-none"
            >
              <option value="all">All Packages</option>
              <option value="installed">Installed Only</option>
              <option value="available">Not Installed</option>
              <option value="updates">Updates Available</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-sky-400 hover:text-sky-300 ml-auto flex items-center gap-1"
            >
              <span>Reset filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Results Count & Current Filter Metadata */}
      <div className="flex items-center justify-between text-xs text-neutral-400 font-mono tabular-nums pb-2 border-b border-neutral-800/80">
        <span>
          Showing {paginated.length} of {filtered.length} packages
        </span>
        <span>Page {currentPage} of {totalPages}</span>
      </div>

      {/* Package View Area */}
      {paginated.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginated.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-neutral-800/80 overflow-hidden divide-y divide-neutral-800/60">
            {paginated.map(pkg => (
              <AppListItem
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
              />
            ))}
          </div>
        )
      ) : (
        <div className="py-20 text-center space-y-3">
          <p className="text-sm text-neutral-300">No applications match your filter criteria.</p>
          <p className="text-xs text-neutral-500">Try broadening your search term or resetting category filters.</p>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-neutral-400 font-mono px-3">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-neutral-200 disabled:opacity-40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
