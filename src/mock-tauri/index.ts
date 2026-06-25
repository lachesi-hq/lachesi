import { mockHandlers } from "./mock-handlers";

/** True when running inside a Tauri webview (vs browser dev / Storybook / Vitest). */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Resolve a mocked IPC command. Throws for unknown commands so gaps surface early. */
export async function mockInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const handler = mockHandlers[command];
  if (!handler) {
    throw new Error(`[mock-tauri] no mock handler registered for command "${command}"`);
  }
  // Simulate a tiny async latency so loading states are exercised in the browser.
  await new Promise((r) => setTimeout(r, 40));
  return handler(args) as T;
}
