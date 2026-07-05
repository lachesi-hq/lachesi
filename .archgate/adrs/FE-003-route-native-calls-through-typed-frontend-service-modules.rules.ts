/// <reference path="../rules.d.ts" />

const CALL_PATTERN = /\btauriCall\s*\(/g;

export default {
  rules: {
    "components-do-not-call-tauricall-directly": {
      description:
        "Presentational components must route native calls through hooks or typed services, not call tauriCall directly",
      async check(ctx) {
        const files = [
          ...(await ctx.glob("src/components/**/*.tsx")),
          ...(await ctx.glob("src/components/**/*.ts")),
        ];

        for (const file of files) {
          const matches = await ctx.grep(file, CALL_PATTERN);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Move this tauriCall out of the component and into a hook or typed service above tauriCall (FE-003).",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
