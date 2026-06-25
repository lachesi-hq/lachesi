/// <reference path="../rules.d.ts" />

const ALLOWED_FILES = new Set(["src/hooks/useDraftComments.ts", "src/mock-tauri/mock-handlers.ts"]);

const COMMENT_COMMAND_PATTERN = /\bcreate_(inline|general)_comment\b/g;

export default {
  rules: {
    "comment-posting-stays-in-publish-flow": {
      description:
        "Bitbucket comment creation commands must stay inside the staged draft publish flow",
      async check(ctx) {
        const files = [...(await ctx.glob("src/**/*.ts")), ...(await ctx.glob("src/**/*.tsx"))];

        for (const file of files) {
          if (ALLOWED_FILES.has(file)) continue;
          const matches = await ctx.grep(file, COMMENT_COMMAND_PATTERN);
          for (const match of matches) {
            ctx.report.violation({
              message:
                "Route Bitbucket comment creation through src/hooks/useDraftComments.ts instead of posting directly from UI code.",
              file: match.file,
              line: match.line,
            });
          }
        }
      },
    },
  },
} satisfies RuleSet;
