import { invoke } from "@tauri-apps/api/core";
import { isTauri, mockInvoke } from "@/mock-tauri";

/**
 * Single entry point for all IPC. Inside Tauri it forwards to the real Rust
 * command; everywhere else (browser dev, Storybook, Vitest) it routes to the
 * mock layer. Keep every command call going through here.
 */
export function tauriCall<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauri()) {
    return invoke<T>(command, args);
  }
  return mockInvoke<T>(command, args);
}

/** Open a URL in the user's default browser (Tauri opener plugin, else window.open). */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export { isTauri };
