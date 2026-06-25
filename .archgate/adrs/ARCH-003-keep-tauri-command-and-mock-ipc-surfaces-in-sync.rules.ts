/// <reference path="../rules.d.ts" />

const TAURI_LIB = "src-tauri/src/lib.rs";
const MOCK_HANDLERS = "src/mock-tauri/mock-handlers.ts";

function extractTauriCommands(source: string): string[] {
  const match = source.match(/generate_handler!\s*\[([\s\S]*?)\]/m);
  if (!match) return [];
  return [...match[1].matchAll(/[a-zA-Z_][a-zA-Z0-9_]*::([a-zA-Z_][a-zA-Z0-9_]*)/g)].map(
    (entry) => entry[1],
  );
}

function extractMockCommands(source: string): string[] {
  const start = source.indexOf("export const mockHandlers");
  if (start < 0) return [];

  const bodyStart = source.indexOf("{", start);
  const bodyEnd = source.indexOf("\n};", bodyStart);
  if (bodyStart < 0 || bodyEnd < 0) return [];

  const body = source.slice(bodyStart + 1, bodyEnd);
  return [...body.matchAll(/^ {2}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map((entry) => entry[1]);
}

export default {
  rules: {
    "tauri-commands-have-mock-handlers": {
      description: "Every Tauri command must exist in the mock IPC handler map",
      async check(ctx) {
        const tauri = extractTauriCommands(await ctx.readFile(TAURI_LIB));
        const mock = new Set(extractMockCommands(await ctx.readFile(MOCK_HANDLERS)));

        for (const command of tauri) {
          if (!mock.has(command)) {
            ctx.report.violation({
              message: `Add a mockHandlers entry for the Tauri command "${command}".`,
              file: MOCK_HANDLERS,
            });
          }
        }
      },
    },
    "mock-handlers-map-to-real-commands": {
      description: "Mock IPC handlers must correspond to real registered Tauri commands",
      async check(ctx) {
        const tauri = new Set(extractTauriCommands(await ctx.readFile(TAURI_LIB)));
        const mock = extractMockCommands(await ctx.readFile(MOCK_HANDLERS));

        for (const command of mock) {
          if (!tauri.has(command)) {
            ctx.report.violation({
              message: `Remove or back the mockHandlers entry "${command}" with a real Tauri command registration.`,
              file: MOCK_HANDLERS,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
