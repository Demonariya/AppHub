import React from 'react';
import { ShieldAlert, Check, FolderOpen } from 'lucide-react';
import { Package, TaskAction } from '../../types';
import { AppIconImage } from '../common/AppIconImage';
import { storage } from '../../services/storage';
import { Button, Dialog } from '../ui';

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
  const defaultSilent = storage.getSettings().silentInstall;
  const [silent, setSilent] = React.useState(defaultSilent);
  const [force, setForce] = React.useState(false);
  const [useCustomLocation, setUseCustomLocation] = React.useState(!!initialCustomLocation);
  const [customLocation, setCustomLocation] = React.useState(
    initialCustomLocation || (pkg ? `D:\\Software\\${pkg.name}` : '')
  );

  React.useEffect(() => {
    setSilent(storage.getSettings().silentInstall);
    setForce(false);
    if (initialCustomLocation) {
      setUseCustomLocation(true);
      setCustomLocation(initialCustomLocation);
    } else if (pkg) {
      setUseCustomLocation(false);
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
    <Dialog
      isOpen={Boolean(pkg)}
      onClose={onCancel}
      title={`${actionText} ${pkg.name}`}
      subtitle="WinGet may request Windows UAC elevation depending on installer scope."
      maxWidthClass="max-w-lg"
      icon={
        <div className="w-9 h-9 rounded-[8px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex items-center justify-center text-[var(--status-warning-fg)]">
          <ShieldAlert className="w-4 h-4" />
        </div>
      }
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={action === 'uninstall' ? 'danger' : 'primary'}
            leftIcon={<Check className="w-3.5 h-3.5" />}
            onClick={() =>
              onConfirm({
                silent,
                force,
                customLocation:
                  useCustomLocation && customLocation.trim() ? customLocation.trim() : undefined,
              })
            }
          >
            Authorize &amp; {actionText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="p-3.5 rounded-[10px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] flex items-center gap-3">
          <AppIconImage pkg={pkg} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                {pkg.name}
              </span>
              <span className="text-xs font-mono text-[var(--accent-primary)] tabular-nums shrink-0">
                v{pkg.latestVersion}
              </span>
            </div>
            <div className="text-xs font-mono text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5 truncate">
              <span className="truncate">{pkg.id}</span>
              <span>·</span>
              <span className="truncate">{pkg.publisher}</span>
            </div>
          </div>
        </div>

        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
          Confirm executing <strong className="text-[var(--text-primary)]">{actionText}</strong> via Microsoft WinGet CLI.
        </p>

        <div className="space-y-3 pt-3 border-t border-[var(--border-subtle)]">
          {action !== 'uninstall' && (
            <div className="space-y-2">
              <label className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useCustomLocation}
                  onChange={e => setUseCustomLocation(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
                />
                <span>
                  Install to custom directory (<code className="text-[var(--accent-primary)]">--location</code>)
                </span>
              </label>

              {useCustomLocation && (
                <div className="relative pl-6">
                  <FolderOpen className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-8.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={customLocation}
                    onChange={e => setCustomLocation(e.target.value)}
                    placeholder="e.g. D:\Software\..."
                    className="w-full pl-8 pr-3 h-8 bg-[var(--surface-input)] border border-[var(--border-subtle)] focus:border-[var(--border-focus)] rounded-[8px] text-xs font-mono text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}

          <label className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={silent}
              onChange={e => setSilent(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
            />
            <span>
              Run silent installation (<code className="text-[var(--text-muted)]">--silent</code>)
            </span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-[var(--text-primary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={force}
              onChange={e => setForce(e.target.checked)}
              className="w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer"
            />
            <span>
              Force installer execution (<code className="text-[var(--text-muted)]">--force</code>)
            </span>
          </label>
        </div>
      </div>
    </Dialog>
  );
};
