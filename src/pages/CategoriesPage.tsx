import React from 'react';
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
  ArrowRight,
  ChevronLeft,
} from 'lucide-react';

interface CategoriesPageProps {
  packages: Package[];
  selectedCategory: CategoryType | null;
  onSelectCategory: (cat: CategoryType | null) => void;
  onOpenDetails: (pkg: Package) => void;
  onActionClick: (pkg: Package, action: TaskAction) => void;
}

const CATEGORY_META: Record<
  CategoryType,
  { icon: React.ComponentType<{ className?: string }>; description: string }
> = {
  Browsers: {
    icon: Globe,
    description: 'Fast, secure, and privacy-oriented web browsers for modern web navigation.',
  },
  Development: {
    icon: Code2,
    description: 'Code editors, language compilers, terminals, container platforms, and CLI tooling.',
  },
  Gaming: {
    icon: Gamepad2,
    description: 'Game storefront clients, digital launchers, mod managers, and game utilities.',
  },
  Multimedia: {
    icon: Film,
    description: 'Audio players, video encoders, streaming suites, 3D creation, and graphic tools.',
  },
  Communication: {
    icon: MessageSquare,
    description: 'Encrypted messengers, voice chat servers, video conferencing, and team workspaces.',
  },
  Security: {
    icon: ShieldCheck,
    description: 'Password vaults, cryptographic tunnels, VPN clients, and malware defense.',
  },
  Productivity: {
    icon: Briefcase,
    description: 'Markdown knowledge bases, local notes, document processors, and office suites.',
  },
  Utilities: {
    icon: Wrench,
    description: 'Windows power tools, high-speed NTFS search, screen recorders, and USB imaging.',
  },
  'System Tools': {
    icon: Cpu,
    description: 'Hardware health telemetry, Sysinternals troubleshooting, and drive maintenance.',
  },
  Compression: {
    icon: Archive,
    description: 'High-ratio archive managers with 7z, ZIP, TAR, and RAR extraction support.',
  },
  'Drivers and Hardware Utilities': {
    icon: HardDrive,
    description: 'GPU companion software, mouse configuration, peripheral suites, and vendor drivers.',
  },
};

export const CategoriesPage: React.FC<CategoriesPageProps> = ({
  packages,
  selectedCategory,
  onSelectCategory,
  onOpenDetails,
  onActionClick,
}) => {
  // If a specific category is selected, show category details and all packages in that category
  if (selectedCategory) {
    const meta = CATEGORY_META[selectedCategory];
    const Icon = meta.icon;
    const catPackages = packages.filter(p => p.category === selectedCategory);

    return (
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
        <button
          onClick={() => onSelectCategory(null)}
          className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-sky-400 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Back to All Categories</span>
        </button>

        {/* Category Header Banner */}
        <div className="p-6 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-sky-400 shrink-0">
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-100">{selectedCategory}</h1>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{meta.description}</p>
            <div className="text-[11px] text-neutral-500 font-mono mt-2">
              {catPackages.length} packages available in this category
            </div>
          </div>
        </div>

        {/* Category Packages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {catPackages.map(pkg => (
            <AppCard
              key={pkg.id}
              pkg={pkg}
              onOpenDetails={onOpenDetails}
              onActionClick={onActionClick}
            />
          ))}
        </div>
      </div>
    );
  }

  // Otherwise, show the 11 categories grid
  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Package Categories</h1>
        <p className="text-xs text-neutral-400 mt-1">
          Browse software organized by verified Microsoft WinGet functional classifications.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES_LIST.map(category => {
          const meta = CATEGORY_META[category];
          const Icon = meta.icon;
          const count = packages.filter(p => p.category === category).length;

          return (
            <div
              key={category}
              onClick={() => onSelectCategory(category)}
              className="group bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 rounded-xl p-5 transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center justify-center text-neutral-300 group-hover:text-sky-400 group-hover:border-sky-500/40 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] font-mono text-neutral-500">
                    {count} {count === 1 ? 'app' : 'apps'}
                  </span>
                </div>

                <h3 className="font-semibold text-sm text-neutral-100 group-hover:text-sky-300 transition-colors">
                  {category}
                </h3>
                <p className="text-xs text-neutral-400 line-clamp-2 mt-1 leading-relaxed">
                  {meta.description}
                </p>
              </div>

              <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between text-xs text-neutral-400 group-hover:text-sky-400 transition-colors mt-4">
                <span>Explore software</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
