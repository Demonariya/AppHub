export type PackageRow = {
  name: string;
  id: string;
  version: string;
  available_version?: string | null;
  source?: string | null;
};
export type WingetStatus = {
  available: boolean;
  version?: string | null;
  path?: string | null;
  app_installer: boolean;
};
export type SourceRow = { name: string; argument: string; type: string };
export type CommandResult = { success: boolean; code: number | null; stdout: string; stderr: string };
