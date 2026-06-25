# Lachesi

A GitHub-feeling **Bitbucket pull request review** desktop app, built with Tauri v2 + React 19.

Named after Lachesis, the Moira (Fate) who *measures the thread* — here, measuring and reviewing
code. Browse pull requests, read clean GitHub-style diffs, leave per-line (inline) comments, and
publish them to Bitbucket via the REST API.

## Why

Bitbucket's web review UI is hard to read coming from GitHub. Lachesi gives a familiar,
keyboard-friendly review surface for Bitbucket Cloud repositories.

## Stack

- **Tauri v2** (Rust) — all Bitbucket HTTP lives in Rust (`reqwest`), keeping the API token out of
  the webview and sidestepping CORS.
- **React 19 + TypeScript + Vite** frontend.
- **Tailwind v4** + CSS variables (light/dark), shadcn-style primitives, Phosphor icons.
- **Biome** (lint + format), **Vitest** + Testing Library, **Storybook 10**.

## Architecture

- No router — a discriminated-union `AppSelection` state drives the views (sidebar → PR → settings).
- No external state lib — React hooks + IPC; Rust is the source of truth.
- All IPC goes through `src/lib/tauri.ts` (`tauriCall`), which routes to a mock layer
  (`src/mock-tauri/`) when running outside Tauri (browser dev, Storybook, Vitest).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Vite dev server (browser, mock IPC) on port 5210 |
| `pnpm tauri dev` | Run the desktop app |
| `pnpm storybook` | Component workbench |
| `pnpm test` | Vitest unit/component tests |
| `pnpm lint` | Biome check |
| `pnpm build` | Type-check + production build |

## Auth

Bitbucket Cloud uses **HTTP Basic** auth with an Atlassian account email + API token
(`ATATT…`). Credentials are stored in the macOS Keychain (with an `.env` fallback for dev);
non-secret config (workspace/repo/prefs) lives in a settings file.

## Roadmap

Tracked as GitHub issues (labels `P0`–`P3`, phases `M0`–`M6`). M0 = skeleton; M1 = auth;
M2 = PR browsing; M3 = diff viewing; M4 = read comments; M5 = compose + publish; M6 = polish.
