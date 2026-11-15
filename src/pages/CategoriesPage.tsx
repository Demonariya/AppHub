import React, { useState, useMemo } from 'react';
import { CategoryType, Package, TaskAction } from '../types';
import { CATEGORIES_LIST } from '../services/catalog';
import { AppCard } from '../components/common/AppCard';
import {
  Globe,
  Code2,
  Gamepad2,
  Film,
  MessageSquare,
  ShieldCheck,
  Briefcase,
  Wrench,
  Cpu,
  Archive,
  HardDrive,
  Tag,
  ArrowRight,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import { PageHeader, SearchInput, Button, EmptyState } from '../components/ui';

interface CategoriesPageProps {
  packages: Package[];
  selectedCategory: CategoryType | null;
  onSelectCategory: (cat: CategoryType | null) => void;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onToggleFavorite?: (pkg: Package) => void;
  isSyncing?: boolean;
  onStartSync?: () => void;
}

const CATEGORY_META: Record<
  CategoryType,
  { icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  Browsers: {
    icon: Globe,
    description: 'Web browsers, privacy-focused clients, and rendering engines.',
  },
  Development: {
    icon: Code2,
    description: 'Code editors, compilers, terminals, container platforms, and CLI tooling.',
  },
  Gaming: {
    icon: Gamepad2,
    description: 'Game storefront clients, digital launchers, and mod managers.',
  },
  Multimedia: {
    icon: Film,
    description: 'Audio players, video encoders, streaming suites, and graphic editors.',
  },
  Communication: {
    icon: MessageSquare,
    description: 'Encrypted messengers, voice chat servers, and video conferencing.',
  },
  Security: {
    icon: ShieldCheck,
    description: 'Password vaults, cryptographic tunnels, VPN clients, and defense.',
  },
  Productivity: {
    icon: Briefcase,
    description: 'Markdown knowledge bases, local notes, and document suites.',
  },
  Utilities: {
    icon: Wrench,
    description: 'Windows power tools, file managers, screen recorders, and imaging.',
  },
  'System Tools': {
    icon: Cpu,
    description: 'Hardware diagnostics, Sysinternals troubleshooting, and maintenance.',
  },
  Compression: {
    icon: Archive,
    description: 'Archive managers with 7z, ZIP, TAR, and RAR support.',
  },
  'Drivers and Hardware Utilities': {
    icon: HardDrive,
    description: 'GPU companion software, peripheral configuration, and vendor drivers.',
  },
  Uncategorized: {
    icon: Tag,
    description: 'Synchronized WinGet packages whose summary records have not yet been enriched with category tags.',
  },
};

export const CategoriesPage: React.FC<CategoriesPageProps> = ({
  packages,
  selectedCategory,
  onSelectCategory,
  onOpenDetails,
  onActionClick,
  onToggleFavorite,
  isSyncing = false,
  onStartSync,
}) => {
  const [catQuery, setCatQuery] = useState('');

  const catPackages = useMemo(() => {
    if (!selectedCategory) return [];
    return packages
      .filter(p => p.category === selectedCategory)
      .filter(p => {
        if (!catQuery.trim()) return true;
        const q = catQuery.toLowerCase().trim();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.publisher || '').toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
        );
      });
  }, [packages, selectedCategory, catQuery]);

  if (selectedCategory) {
    const meta = CATEGORY_META[selectedCategory];
    const Icon = meta.icon;

    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
        <PageHeader
          title={selectedCategory}
          subtitle={meta.description}
          breadcrumbs={[
            {
              label: 'All Categories',
              onClick: () => {
                setCatQuery('');
                onSelectCategory(null);
              },
            },
            { label: selectedCategory },
          ]}
          actions={
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              onClick={() => {
                setCatQuery('');
                onSelectCategory(null);
              }}
            >
              All Categories
            </Button>
          }
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
            <Icon className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>{catPackages.length} packages</span>
          </div>

          <SearchInput
            value={catQuery}
            onChange={setCatQuery}
            placeholder={`Filter ${selectedCategory}...`}
            className="w-full sm:w-72"
          />
        </div>

        {catPackages.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {catPackages.map(pkg => (
              <AppCard
                key={pkg.packageKey || `${pkg.source}::${pkg.id}`}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
                onToggleFavorite={onToggleFavorite}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            icon={<Icon className="w-5 h-5" />}
            title={catQuery ? 'No Packages Match Filter' : `No Packages Indexed Under ${selectedCategory}`}
            description={
              catQuery
                ? 'No software in this category matched your filter.'
                : 'Categories populate automatically as packages are synchronized and enriched from WinGet.'
            }
            action={
              catQuery ? (
                <Button size="sm" variant="secondary" onClick={() => setCatQuery('')}>
                  Reset Filter
                </Button>
              ) : onStartSync ? (
                <Button
                  size="sm"
                  variant="secondary"
                  loading={isSyncing}
                  onClick={onStartSync}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                >
                  Sync Catalog
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-page-in">
      <PageHeader
        title="Software Categories"
        subtitle="Dynamically classified from synchronized WinGet packages and enriched manifest metadata."
        actions={
          onStartSync ? (
            <Button
              size="sm"
              variant="secondary"
              loading={isSyncing}
              onClick={onStartSync}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Sync Catalog
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES_LIST.map(category => {
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          const catApps = packages.filter(p => p.category === category);
          const installedInCat = catApps.filter(p => p.isInstalled).length;

          return (
            <button
              key={category}
              type="button"
              onClick={() => {
                setCatQuery('');
                onSelectCategory(category);
              }}
              className="group text-left bg-[var(--surface-panel)] hover:bg-[var(--surface-hover)]/70 border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-[12px] p-5 transition-all cursor-pointer flex flex-col justify-between shadow-[var(--shadow-card)]"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-[8px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)] group-hover:border-[var(--accent-border)] transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                    {catApps.length} {catApps.length === 1 ? 'app' : 'apps'}
                    {installedInCat > 0 ? ` · ${installedInCat} installed` : ''}
                  </span>
                </div>

                <h2 className="font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">
                  {category}
                </h2>
                <p className="text-xs text-[var(--text-secondary)] line-clamp-2 mt-1 leading-relaxed">
                  {meta.description}
                </p>
              </div>

              <div className="pt-3 border-t border-[var(--border-subtle)] flex items-center justify-between text-xs text-[var(--text-secondary)] group-hover:text-[var(--accent-primary)] transition-colors mt-4">
                <span>Browse category</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
