/// <reference path="../rules.d.ts" />

const COMMANDS_GLOB = "src-tauri/src/commands/*.rs";
const MAX_LINES = 1500;

export default {
  rules: {
    "command-modules-stay-thin": {
      description:
        "Tauri command modules under src-tauri/src/commands/ must stay small; extract provider clients, persistence, and orchestration into focused modules",
      async check(ctx) {
        const files = await ctx.glob(COMMANDS_GLOB);

        for (const file of files) {
          const source = await ctx.readFile(file);
          const lineCount = source.split("\n").length;
          if (lineCount > MAX_LINES) {
            ctx.report.violation({
              message: `Command module "${file}" is ${lineCount} lines (limit ${MAX_LINES}). Extract provider clients, DTO mapping, persistence, or orchestration into focused native service modules so the command handlers stay thin.`,
              file,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
