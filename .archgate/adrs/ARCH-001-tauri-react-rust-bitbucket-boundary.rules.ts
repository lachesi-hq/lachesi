/// <reference path="../rules.d.ts" />

export default {
  rules: {
    "use-shared-tauri-entrypoint": {
      description: "Frontend IPC must go through src/lib/tauri.ts instead of direct invoke() calls",
      async check(ctx) {
        const files = [...(await ctx.glob("src/**/*.ts")), ...(await ctx.glob("src/**/*.tsx"))];

        for (const file of files) {
          if (file === "src/lib/tauri.ts") continue;
          const matches = await ctx.grep(file, /\binvoke\s*\(/g);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Use tauriCall() from src/lib/tauri.ts instead of calling invoke() directly.",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
    "no-bitbucket-api-in-frontend": {
      description: "Frontend code must not reference the Bitbucket REST API directly",
      async check(ctx) {
        const files = [...(await ctx.glob("src/**/*.ts")), ...(await ctx.glob("src/**/*.tsx"))];

        for (const file of files) {
          const matches = await ctx.grep(file, /api\.bitbucket\.org/g);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Bitbucket API access belongs in src-tauri Rust commands, not frontend code.",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
