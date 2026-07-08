# Lachesi — Claude Code Notes

Quick reference for AI agents working on this codebase.

## Project Overview

Tauri v2 desktop app: Rust backend (`src-tauri/`) + React 19 + TypeScript + Vite frontend (`src/`). All external API calls go through Rust commands; the frontend calls them via `tauriCall()`. ADRs in `.archgate/adrs/` are enforced by `archgate check`.

## Commands

```bash
pnpm run dev          # start Vite dev server (browser mode, mock IPC)
pnpm run typecheck    # tsc --noEmit
pnpm tauri dev        # start full Tauri app (real IPC, Bitbucket credentials needed)
archgate check        # run ADR compliance checks
```

Credentials for Tauri dev: `BITBUCKET_USERNAME` and `BITBUCKET_TOKEN` env vars must be set before launching.

### Task runners (ARCH-007)

Repository commands are also wrapped by platform-native task runners at the repo root. Use `make <recipe>` on macOS/Linux and `just <recipe>` on Windows — both expose the **same recipe names** (`dev`, `tauri-dev`, `build`, `typecheck`, `lint`, `test`, `test-tauri`, `check`, `bundle-windows`). **Any recipe added, renamed, or removed must be mirrored in BOTH `Makefile` and `justfile`** — recipe-name parity is enforced by the ARCH-007 automated check (`archgate check` fails on a mismatch), including helper recipes like `help`.

### Windows build/distribution (ARCH-008)

The Windows distributable is the Tauri **NSIS setup `.exe`**, built locally on Windows with `just bundle-windows` (`pnpm tauri build --bundles nsis`). Output lands at `src-tauri/target/release/bundle/nsis/Lachesi_<version>_x64-setup.exe`. Builds are currently **unsigned** (SmartScreen warning) and MSI/CI/code-signing are out of scope until a follow-up ADR.

**Windows build prerequisites** (needed for `just bundle-windows` / `pnpm tauri dev`, not for `just dev`):
- **Rust toolchain** — `winget install Rustlang.Rustup` (installs `stable-x86_64-pc-windows-msvc`; adds `~/.cargo/bin` to PATH — open a new terminal after installing).
- **MSVC C++ Build Tools** — `winget install Microsoft.VisualStudio.2022.BuildTools` with the **"Desktop development with C++"** workload. Provides the MSVC `link.exe` linker + Windows SDK that the `*-msvc` Rust toolchain requires. Without it, `cargo build` fails at the link step.
- **WebView2 runtime** — preinstalled on current Windows 10/11; otherwise `winget install Microsoft.EdgeWebView2Runtime`.

## Key Architecture Notes

### IPC boundary
- All external calls go through `tauriCall(commandName, args)` in `src/lib/tauri.ts`
- Every Rust `#[tauri::command]` registered in `src-tauri/src/lib.rs` **must** have a matching mock handler in `src/mock-tauri/mock-handlers.ts` (enforced by ARCH-003 automated check)

### Running CLI tools from Rust
When invoking a user-installed CLI binary (e.g. `claude`) from a Rust Tauri command, use a **zsh login shell**:

```rust
Command::new("/bin/zsh")
    .arg("-lc")
    .arg(&shell_cmd)
    .output()?
```

macOS GUI-launched apps have a minimal `PATH` that omits `~/.local/bin`, `~/.npm/bin`, etc. Without `/bin/zsh -l`, binaries installed via Homebrew, npm, or the Claude installer will not be found.

### Claude CLI headless mode
```
claude --print "prompt"   # non-interactive, prints response to stdout and exits
claude -p "prompt"        # same, short form
```
Binary location on this machine: `~/.local/bin/claude`

### Local data storage
App-generated data (e.g. saved AI reviews) lives at:
```
~/.local/share/lachesi/<subdirectory>/
```
Use `dirs::data_local_dir()` in Rust to get the base path (resolves to `~/.local/share` on Linux/macOS). Create subdirectories with `fs::create_dir_all`.

## CSS Variables

All CSS custom properties in this project are **hex color values** (e.g. `--primary: #1f6feb`), **not** HSL components.

- ✅ Correct in Recharts/SVG: `fill="var(--primary)"`
- ❌ Wrong: `fill="hsl(var(--primary))"` — produces invalid CSS, renders black

When chart colors need variety and `--chart-N` variables don't exist, use hardcoded valid HSL strings:
```ts
const COLORS = ["var(--primary)", "hsl(173 58% 39%)", "hsl(197 37% 24%)"]
```

## Navigation Model

State-driven via `AppSelection` union type (no React Router):
```ts
type AppSelection =
  | { kind: "pr-list" }
  | { kind: "overview" }
  | { kind: "pr"; workspace: string; repo: string; prId: number; activeFilePath: string | null }
```

## Mock IPC Layer

For browser dev / Storybook, `tauriCall` routes to `src/mock-tauri/mock-handlers.ts`. Fixture data is in `src/mock-tauri/fixtures.ts`. When adding a Tauri command, always add both mock handler and fixture data in the same change.
