import React from 'react';
import { ShieldAlert, Check, X, Terminal, Cpu, Folder, FolderOpen } from 'lucide-react';
import { Package, TaskAction } from '../../types';
import { AppIconImage } from '../common/AppIconImage';

interface UACConfirmModalProps {
  pkg: Package | null;
  action: TaskAction;
  initialCustomLocation?: string;
  onConfirm: (options: { silent: boolean; force: boolean; customLocation?: string }) => void;
  onCancel: () => void;
}

export const UACConfirmModal: React.FC<UACConfirmModalProps> = ({
  pkg,
  action,
  initialCustomLocation,
  onConfirm,
  onCancel,
}) => {
  const [silent, setSilent] = React.useState(true);
  const [force, setForce] = React.useState(false);
  const [useCustomLocation, setUseCustomLocation] = React.useState(!!initialCustomLocation);
  const [customLocation, setCustomLocation] = React.useState(
    initialCustomLocation || (pkg ? `D:\\Software\\${pkg.name}` : '')
  );

  React.useEffect(() => {
    if (initialCustomLocation) {
      setUseCustomLocation(true);
      setCustomLocation(initialCustomLocation);
    } else if (pkg) {
      setCustomLocation(`D:\\Software\\${pkg.name}`);
    }
  }, [initialCustomLocation, pkg]);

  if (!pkg) return null;

  const actionText =
    action === 'install'
      ? 'Install'
      : action === 'update'
      ? 'Update'
      : action === 'uninstall'
      ? 'Uninstall'
      : 'Reinstall';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-neutral-900 border border-neutral-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Windows UAC Banner */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-neutral-100">
              Windows User Account Control Confirmation
            </h3>
            <p className="text-xs text-neutral-400">
              WinGet requires privilege authorization to proceed.
            </p>
          </div>
        </div>

        {/* Package Target Details */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center gap-3">
            <AppIconImage pkg={pkg} size="md" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-200 truncate">{pkg.name}</span>
                <span className="text-xs font-mono text-sky-400">v{pkg.latestVersion}</span>
              </div>
              <div className="text-xs font-mono text-neutral-400 flex items-center gap-2 mt-0.5 truncate">
                <span>{pkg.id}</span>
                <span className="text-neutral-600">·</span>
                <span>{pkg.publisher}</span>
              </div>
            </div>
          </div>

          <p className="text-xs text-neutral-300 leading-relaxed">
            You are about to <strong className="text-neutral-100">{actionText}</strong> this package using the official Microsoft WinGet package manager. This process will register files and write system configurations.
          </p>

          {/* Options: Custom Path, Silent & Force */}
          <div className="space-y-3 pt-2 border-t border-neutral-800/80">
            {action !== 'uninstall' && (
              <div className="space-y-1.5">
                <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useCustomLocation}
                    onChange={e => setUseCustomLocation(e.target.checked)}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Install to custom location (<code className="text-sky-400">--location</code>)</span>
                </label>

                {useCustomLocation && (
                  <div className="relative pl-6">
                    <FolderOpen className="w-3.5 h-3.5 text-neutral-500 absolute left-8 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customLocation}
                      onChange={e => setCustomLocation(e.target.value)}
                      placeholder="e.g. D:\Software\..."
                      className="w-full pl-8 pr-3 py-1.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-sky-500 transition-colors"
                    />
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={silent}
                onChange={e => setSilent(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Run silent installation (<code className="text-neutral-400">--silent</code>)</span>
            </label>

            <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={force}
                onChange={e => setForce(e.target.checked)}
                className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span>Force overwrite existing hashes (<code className="text-neutral-400">--force</code>)</span>
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-neutral-950/80 border-t border-neutral-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onConfirm({
                silent,
                force,
                customLocation: useCustomLocation && customLocation.trim() ? customLocation.trim() : undefined,
              })
            }
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-neutral-950 bg-sky-400 hover:bg-sky-300 rounded-lg shadow-sm transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Authorize & Proceed</span>
          </button>
        </div>
      </div>
    </div>
  );
};
