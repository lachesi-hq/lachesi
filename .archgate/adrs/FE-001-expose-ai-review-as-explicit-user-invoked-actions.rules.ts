/// <reference path="../rules.d.ts" />

const ALLOWED_FILES = new Set([
  "src/components/review/ReviewActions.tsx",
  "src/mock-tauri/mock-handlers.ts",
]);

export default {
  rules: {
    "claude-launch-remains-explicit": {
      description:
        "The native Claude launch command must only be referenced from the explicit review action surface",
      async check(ctx) {
        const files = [...(await ctx.glob("src/**/*.ts")), ...(await ctx.glob("src/**/*.tsx"))];

        for (const file of files) {
          if (ALLOWED_FILES.has(file)) continue;
          const matches = await ctx.grep(file, /\blaunch_claude_review\b/g);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Keep launch_claude_review confined to ReviewActions so AI review stays user-invoked and explicit.",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
