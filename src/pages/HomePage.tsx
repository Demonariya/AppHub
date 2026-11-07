import React from 'react';
import { Package, TaskAction } from '../types';
import { AppCard } from '../components/common/AppCard';
import { AppIconImage } from '../components/common/AppIconImage';
import {
  Sparkles,
  ArrowUpCircle,
  TrendingUp,
  Clock,
  ThumbsUp,
  CheckCircle2,
  ChevronRight,
  Download,
  Terminal,
} from 'lucide-react';

interface HomePageProps {
  packages: Package[];
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
  onNavigateToUpdates: () => void;
  onNavigateToDiscover: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  packages,
  onOpenDetails,
  onActionClick,
  onNavigateToUpdates,
  onNavigateToDiscover,
}) => {
  const updateAvailablePackages = packages.filter(
    p => p.isInstalled && p.installedVersion && p.installedVersion !== p.latestVersion
  );

  const featured = packages.find(p => p.id === 'Microsoft.VisualStudioCode') || packages[0];
  const popular = packages.filter(p => p.ratingCount > 15000).slice(0, 4);
  const recentlyUpdated = [...packages].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 4);
  const recommended = packages.filter(p => p.category === 'Utilities' || p.category === 'Security').slice(0, 4);
  const installed = packages.filter(p => p.isInstalled).slice(0, 4);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-10">
      {/* Update Announcement Banner (if any updates exist) */}
      {updateAvailablePackages.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-neutral-100">
                {updateAvailablePackages.length} Application Updates Available
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                New releases detected via WinGet package manifests for installed software.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToUpdates}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-sm transition-colors shrink-0"
          >
            <span>Review & Update All</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero Spotlight Card */}
      {featured && (
        <div
          onClick={() => onOpenDetails(featured)}
          className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-neutral-950 p-6 sm:p-8 cursor-pointer group shadow-xl"
        >
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              {/* Unboxed kicker */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 font-mono">
                <span className="text-sky-400 font-medium">Featured Package</span>
                <span>·</span>
                <span>Microsoft Official</span>
                <span>·</span>
                <span>v{featured.latestVersion}</span>
                <span>·</span>
                <span className="text-neutral-300">
                  {featured.formattedDownloadSize || '90.2 MB'} dl / {featured.formattedInstalledSize || '320 MB'} disk req.
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-100 group-hover:text-sky-200 transition-colors">
                {featured.name}
              </h1>

              <p className="text-sm text-neutral-400 leading-relaxed">
                {featured.longDescription || featured.description}
              </p>

              {/* Tags & Action row */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    onActionClick(featured, featured.isInstalled ? 'reinstall' : 'install');
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors shadow-md"
                >
                  <Download className="w-4 h-4" />
                  <span>{featured.isInstalled ? 'Reinstall' : 'Get Visual Studio Code'}</span>
                </button>

                <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                  <Terminal className="w-3.5 h-3.5 text-neutral-500" />
                  <span>winget install --id {featured.id}</span>
                </div>
              </div>
            </div>

            {/* Right Large Icon / Badge */}
            <AppIconImage pkg={featured} size="xl" className="group-hover:scale-105 transition-transform duration-200" />
          </div>
        </div>
      )}

      {/* Popular Applications */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-semibold text-neutral-100">Popular Applications</h2>
          </div>
          <button
            onClick={onNavigateToDiscover}
            className="text-xs text-neutral-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
          >
            <span>View all</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {popular.map(pkg => (
            <AppCard
              key={pkg.id}
              pkg={pkg}
              onOpenDetails={onOpenDetails}
              onActionClick={onActionClick}
            />
          ))}
        </div>
      </section>

      {/* Recently Updated */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-neutral-100">Recently Updated</h2>
          </div>
          <button
            onClick={onNavigateToDiscover}
            className="text-xs text-neutral-400 hover:text-sky-400 flex items-center gap-1 transition-colors"
          >
            <span>Explore repository</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recentlyUpdated.map(pkg => (
            <AppCard
              key={pkg.id}
              pkg={pkg}
              onOpenDetails={onOpenDetails}
              onActionClick={onActionClick}
            />
          ))}
        </div>
      </section>

      {/* Recommended Software */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ThumbsUp className="w-4 h-4 text-purple-400" />
            <h2 className="text-base font-semibold text-neutral-100">Recommended Power Tools</h2>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {recommended.map(pkg => (
            <AppCard
              key={pkg.id}
              pkg={pkg}
              onOpenDetails={onOpenDetails}
              onActionClick={onActionClick}
            />
          ))}
        </div>
      </section>

      {/* Installed Snapshot */}
      {installed.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <h2 className="text-base font-semibold text-neutral-100">Recently Installed Software</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {installed.map(pkg => (
              <AppCard
                key={pkg.id}
                pkg={pkg}
                onOpenDetails={onOpenDetails}
                onActionClick={onActionClick}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
