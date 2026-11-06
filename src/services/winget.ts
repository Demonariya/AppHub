import { invoke } from "@tauri-apps/api/core";
import type { CommandResult, PackageRow, SourceRow, WingetStatus } from "../types";

export const winget = {
  status: () => invoke<WingetStatus>("winget_status"),
  search: (query: string) => invoke<PackageRow[]>("winget_search", { query }),
  installed: () => invoke<PackageRow[]>("winget_list"),
  updates: () => invoke<PackageRow[]>("winget_updates"),
  sources: () => invoke<SourceRow[]>("winget_sources"),
  install: (id: string) => invoke<CommandResult>("winget_install", { id }),
  uninstall: (id: string) => invoke<CommandResult>("winget_uninstall", { id }),
  upgrade: (id: string) => invoke<CommandResult>("winget_upgrade", { id }),
  upgradeAll: () => invoke<CommandResult>("winget_upgrade_all"),
};
