import { tokenize } from "react-diff-view";
import { refractor } from "refractor";
import jsx from "refractor/jsx";
import tsx from "refractor/tsx";
import type { FileData } from "@/lib/diff";

// `refractor` ships the common languages; tsx/jsx aren't among them.
refractor.register(jsx);
refractor.register(tsx);

// react-diff-view (built for refractor v3) expects highlight() to return the
// node array, but refractor v4+ returns a hast Root, so unwrap `.children`.
const highlighter = {
  highlight: (value: string, language: string) => refractor.highlight(value, language).children,
} as unknown as typeof refractor;

const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  json: "json",
  jsonc: "json",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  html: "markup",
  htm: "markup",
  xml: "markup",
  svg: "markup",
  vue: "markup",
  svelte: "markup",
  md: "markdown",
  mdx: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  rs: "rust",
  py: "python",
  go: "go",
  java: "java",
  rb: "ruby",
  php: "php",
  sql: "sql",
  toml: "toml",
  c: "c",
  h: "c",
  cpp: "cpp",
  graphql: "graphql",
  gql: "graphql",
};

const MAX_CHANGES = 3000;

function languageForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? EXT_LANG[ext] : undefined;
}

/** Syntax-highlight a file's hunks via refractor. Returns undefined when the
 * language is unknown/unregistered, the file is too large, or tokenizing fails. */
export function tokenizeFile(file: FileData): ReturnType<typeof tokenize> | undefined {
  const path = file.newPath || file.oldPath || "";
  const language = languageForPath(path);
  if (!language || !refractor.registered(language)) return undefined;

  const changeCount = file.hunks.reduce((n, h) => n + h.changes.length, 0);
  if (changeCount > MAX_CHANGES) return undefined;

  try {
    return tokenize(file.hunks, { highlight: true, refractor: highlighter, language });
  } catch {
    return undefined;
  }
}
