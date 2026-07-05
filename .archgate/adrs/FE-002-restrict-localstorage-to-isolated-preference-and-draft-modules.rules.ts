/// <reference path="../rules.d.ts" />

const ALLOWED_FILES = new Set([
  "src/hooks/useTheme.ts",
  "src/lib/reviewPrompt.ts",
  "src/hooks/useDraftComments.ts",
  "src/lib/reviewReferencesStorage.ts",
  "src/components/pr-sidebar/PrSidebar.tsx",
  "src/mock-tauri/mock-handlers.ts",
]);

export default {
  rules: {
    "localstorage-stays-in-approved-modules": {
      description:
        "Direct localStorage access is restricted to approved preference and draft owner modules",
      async check(ctx) {
        const files = [...(await ctx.glob("src/**/*.ts")), ...(await ctx.glob("src/**/*.tsx"))];

        for (const file of files) {
          if (ALLOWED_FILES.has(file)) continue;
          const matches = await ctx.grep(file, /\blocalStorage\b/g);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Move localStorage access into an approved owner module or update FE-002 intentionally.",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
