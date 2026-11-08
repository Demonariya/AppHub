import React, { useState } from 'react';
import { AppSettings, WinGetEnvironment, Architecture } from '../types';
import {
  Settings,
  Palette,
  Terminal,
  Shield,
  Download,
  Bell,
  HardDrive,
  Keyboard,
  Info,
  RotateCcw,
  Check,
  ExternalLink,
  Cpu,
} from 'lucide-react';
import { DEFAULT_SETTINGS, storage } from '../services/storage';

interface SettingsPageProps {
  settings: AppSettings;
  environment: WinGetEnvironment;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onResetDefaults: () => void;
  onClearCache: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  settings,
  environment,
  onUpdateSettings,
  onResetDefaults,
  onClearCache,
}) => {
  const [activeTab, setActiveTab] = useState<
    'appearance' | 'installation' | 'updates' | 'diagnostics' | 'shortcuts' | 'about'
  >('appearance');
  const [savedAlert, setSavedAlert] = useState(false);

  const handleToggle = (key: keyof AppSettings) => {
    const updated = !settings[key];
    onUpdateSettings({ [key]: updated });
    triggerSaved();
  };

  const triggerSaved = () => {
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 2000);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-100">Settings & System Preferences</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Configure AppHub behavior, WinGet CLI execution parameters, and UI preferences.
          </p>
        </div>

        <button
          onClick={onResetDefaults}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset All to Defaults</span>
        </button>
      </div>

      {savedAlert && (
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>Preferences updated and persisted.</span>
        </div>
      )}

      {/* Main Settings Layout: Tab List + Content */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Nav tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-col gap-1.5">
          {[
            { id: 'appearance', label: 'Appearance', icon: Palette },
            { id: 'installation', label: 'Installation & UAC', icon: Download },
            { id: 'updates', label: 'Updates & Telemetry', icon: Bell },
            { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
            { id: 'diagnostics', label: 'WinGet Diagnostics', icon: Terminal },
            { id: 'about', label: 'About AppHub', icon: Info },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-sky-400' : 'text-neutral-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content Pane */}
        <div className="md:col-span-3 bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-6 space-y-6">
          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-neutral-800">
                Visual Appearance & Density
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-300 block mb-2 font-medium">Color Theme</label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'dark', label: 'Dark Graphite (Default)' },
                      { id: 'light', label: 'Fluent Light' },
                      { id: 'system', label: 'System Default' },
                    ].map(t => (
                      <button
                        key={t.id}
                        onClick={() => {
                          onUpdateSettings({ theme: t.id as any });
                          triggerSaved();
                        }}
                        className={`p-3 rounded-xl border text-xs text-left transition-all ${
                          settings.theme === t.id
                            ? 'border-sky-500 bg-sky-950/20 text-white font-semibold'
                            : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-neutral-800">
                  <label className="text-xs text-neutral-300 block mb-2 font-medium">Layout Density</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'comfortable', label: 'Comfortable (Standard spacing)' },
                      { id: 'compact', label: 'Compact (High information density)' },
                    ].map(d => (
                      <button
                        key={d.id}
                        onClick={() => {
                          onUpdateSettings({ density: d.id as any });
                          triggerSaved();
                        }}
                        className={`p-3 rounded-xl border text-xs text-left transition-all ${
                          settings.density === d.id
                            ? 'border-sky-500 bg-sky-950/20 text-white font-semibold'
                            : 'border-neutral-800 hover:border-neutral-700 text-neutral-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Installation & UAC Tab */}
          {activeTab === 'installation' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-neutral-800">
                WinGet Process Execution & UAC
              </h2>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.silentInstall}
                    onChange={() => handleToggle('silentInstall')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Silent Installation</div>
                    <div className="text-[11px] text-neutral-400">
                      Appends <code className="text-sky-400">--silent</code> to WinGet arguments to minimize background setup wizards.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.requireConfirmation}
                    onChange={() => handleToggle('requireConfirmation')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Require UAC Authorization Dialog</div>
                    <div className="text-[11px] text-neutral-400">
                      Prompt confirmation explaining administrative privileges before executing installers that modify system directories.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.autoAcceptAgreements}
                    onChange={() => handleToggle('autoAcceptAgreements')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Auto-Accept Package & Source Agreements</div>
                    <div className="text-[11px] text-neutral-400">
                      Passes <code className="text-sky-400">--accept-package-agreements --accept-source-agreements</code> to avoid interactive CLI prompts.
                    </div>
                  </div>
                </label>

                <div className="pt-4 border-t border-neutral-800">
                  <label className="text-xs text-neutral-300 block mb-1 font-medium">Preferred Target Architecture</label>
                  <select
                    value={settings.preferredArchitecture}
                    onChange={e => {
                      onUpdateSettings({ preferredArchitecture: e.target.value as Architecture });
                      triggerSaved();
                    }}
                    className="bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 rounded-lg px-3 py-2 font-mono"
                  >
                    <option value="x64">x64 (AMD64 64-bit)</option>
                    <option value="arm64">ARM64 (Qualcomm Snapdragon / Windows on ARM)</option>
                    <option value="x86">x86 (32-bit Legacy)</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-neutral-800 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium text-neutral-200">Default Custom Installation Directory</div>
                      <div className="text-[11px] text-neutral-400">
                        Automatically pass <code className="text-sky-400">--location &lt;path&gt;</code> to WinGet installations.
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.useCustomLocationByDefault || false}
                        onChange={() => handleToggle('useCustomLocationByDefault')}
                        className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-[11px] font-mono text-neutral-300">Enable by default</span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={settings.defaultCustomLocation || ''}
                      onChange={e => {
                        onUpdateSettings({ defaultCustomLocation: e.target.value });
                        triggerSaved();
                      }}
                      placeholder="e.g. D:\Software or C:\Apps"
                      className="flex-1 min-w-[200px] px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-lg text-xs font-mono text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateSettings({ defaultCustomLocation: 'D:\\Software' });
                        triggerSaved();
                      }}
                      className="px-2.5 py-2 text-xs font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded-lg transition-colors"
                    >
                      D:\Software
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateSettings({ defaultCustomLocation: 'C:\\Program Files' });
                        triggerSaved();
                      }}
                      className="px-2.5 py-2 text-xs font-mono bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 rounded-lg transition-colors"
                    >
                      C:\Program Files
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Updates & Telemetry Tab */}
          {activeTab === 'updates' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-neutral-800">
                Update Scans & Telemetry
              </h2>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.checkUpdatesOnStartup}
                    onChange={() => handleToggle('checkUpdatesOnStartup')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Scan for Updates on App Launch</div>
                    <div className="text-[11px] text-neutral-400">
                      Automatically queries WinGet metadata feeds when AppHub opens to flag outdated applications.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.desktopNotifications}
                    onChange={() => handleToggle('desktopNotifications')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Windows Desktop Notifications</div>
                    <div className="text-[11px] text-neutral-400">
                      Show native system toast notifications when software installations or batch updates complete.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={settings.telemetryDisabled}
                    onChange={() => handleToggle('telemetryDisabled')}
                    className="w-4 h-4 rounded bg-neutral-800 border-neutral-700 text-sky-500 focus:ring-0 mt-0.5 cursor-pointer"
                  />
                  <div>
                    <div className="text-xs font-medium text-neutral-200">Strict Privacy / Zero Telemetry</div>
                    <div className="text-[11px] text-neutral-400">
                      Ensures zero analytical tracking. Only direct queries to official WinGet sources are performed.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Keyboard Shortcuts Tab */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-neutral-800">
                Global Keyboard Shortcuts
              </h2>

              <div className="divide-y divide-neutral-800/80">
                {[
                  { keys: ['Ctrl', 'K'], desc: 'Open instant package search overlay' },
                  { keys: ['Ctrl', 'R'], desc: 'Sync repository metadata with WinGet' },
                  { keys: ['Ctrl', '1'], desc: 'Navigate to Store Home' },
                  { keys: ['Ctrl', '2'], desc: 'Navigate to Discover' },
                  { keys: ['Ctrl', '3'], desc: 'Navigate to Categories' },
                  { keys: ['Ctrl', '4'], desc: 'Navigate to Installed Software' },
                  { keys: ['Ctrl', '5'], desc: 'Navigate to Update Center' },
                  { keys: ['Ctrl', '`'], desc: 'Toggle WinGet CLI terminal console' },
                  { keys: ['Esc'], desc: 'Close open modal dialogs or search' },
                ].map((s, idx) => (
                  <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                    <span className="text-neutral-300">{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map(k => (
                        <kbd
                          key={k}
                          className="px-2 py-0.5 rounded bg-neutral-950 border border-neutral-700 text-neutral-300 font-mono text-[11px]"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostics Tab */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-6">
              <h2 className="text-sm font-semibold text-neutral-100 pb-2 border-b border-neutral-800">
                WinGet Host Diagnostics & Environment
              </h2>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="text-neutral-500">WinGet CLI Status</div>
                  <div className="text-emerald-400 font-semibold mt-1">
                    {environment.isInstalled ? 'Installed & Ready' : 'Not Detected'}
                  </div>
                </div>

                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="text-neutral-500">WinGet Version</div>
                  <div className="text-neutral-200 mt-1">{environment.version}</div>
                </div>

                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 col-span-2">
                  <div className="text-neutral-500">Binary Path</div>
                  <div className="text-neutral-200 mt-1 truncate">{environment.path}</div>
                </div>

                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="text-neutral-500">Windows OS Build</div>
                  <div className="text-neutral-200 mt-1">{environment.windowsVersion}</div>
                </div>

                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                  <div className="text-neutral-500">System Architecture</div>
                  <div className="text-neutral-200 uppercase mt-1">{environment.architecture}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-neutral-200">Local Cache Maintenance</div>
                  <div className="text-[11px] text-neutral-400">Purge cached package manifests and query indexes.</div>
                </div>
                <button
                  onClick={onClearCache}
                  className="px-3 py-1.5 text-xs text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg border border-neutral-700 transition-colors"
                >
                  Clear Cache
                </button>
              </div>
            </div>
          )}

          {/* About Tab */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-4 border-b border-neutral-800">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-500 flex items-center justify-center text-xl font-bold text-white shadow-md">
                  W
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-100">AppHub</h3>
                  <p className="text-xs text-neutral-400 font-mono">
                    Version 0.1.0-release (Windows x64 / Rust / Tauri 2)
                  </p>
                </div>
              </div>

              <p className="text-xs text-neutral-300 leading-relaxed">
                AppHub is an open-source, commercial-grade Windows package store powered by Microsoft WinGet CLI, engineered with Rust, Tauri 2, React, and Tailwind CSS. Built to provide a blazing-fast, minimalist, and transparent software management experience for Windows 10 and 11 power users.
              </p>

              <div className="space-y-2 text-xs font-mono text-neutral-400 pt-2">
                <div>Licensed under Apache License 2.0</div>
                <div>Repository: github.com/apphub-windows/apphub</div>
                <div>Compatible with Microsoft App Installer v1.23+</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
