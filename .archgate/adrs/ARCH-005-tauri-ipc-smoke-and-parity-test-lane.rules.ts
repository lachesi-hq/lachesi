/// <reference path="../rules.d.ts" />

const TEST_TAURI_SCRIPT = "test:tauri";

export default {
  rules: {
    "tauri-ipc-test-lane-exists": {
      description:
        "package.json must expose a dedicated test:tauri script that runs the real-IPC smoke/parity lane",
      async check(ctx) {
        const pkg = await ctx.readJSON("package.json");
        const scripts = pkg.scripts ?? {};

        if (!scripts[TEST_TAURI_SCRIPT]) {
          ctx.report.violation({
            message: `Add a "${TEST_TAURI_SCRIPT}" script to package.json that runs the Tauri IPC smoke/parity lane against the real command surface (ARCH-005).`,
            file: "package.json",
          });
        }
      },
    },
  },
} satisfies RuleSet;
