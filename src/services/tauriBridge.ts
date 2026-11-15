/**
 * Typed Tauri 2 IPC Bridge
 * Automatically senses whether running in a native Tauri desktop window or web preview.
 * Routes commands to native Rust backend when in desktop environment.
 */

export function isTauriEnvironment(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__)
  );
}

/**
 * Invokes a Tauri backend command safely with typed payload.
 */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, any>
): Promise<T> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<T>(command, args);
    } catch (err) {
      console.error(`[Tauri IPC] Command '${command}' failed:`, err);
      throw err;
    }
  }
  throw new Error(`[AppHub] Native command '${command}' is only available in the desktop environment.`);
}

/**
 * Checks if a specific Tauri command can execute in the current runtime.
 */
export async function tryInvokeCommand<T>(
  command: string,
  args?: Record<string, any>,
  fallbackValue?: T
): Promise<T | undefined> {
  if (!isTauriEnvironment()) {
    return fallbackValue;
  }
  try {
    return await invokeCommand<T>(command, args);
  } catch {
    return fallbackValue;
  }
}
