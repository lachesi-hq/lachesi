import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./diff";
import { tokenizeFile } from "./highlight";

function collectClassNames(value: unknown, out = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const item of value) collectClassNames(item, out);
    return out;
  }

  const record = value as Record<string, unknown>;
  const properties = record.properties;
  if (properties && typeof properties === "object") {
    const className = (properties as { className?: unknown }).className;
    if (Array.isArray(className)) {
      for (const name of className) {
        if (typeof name === "string") out.add(name);
      }
    }
  }

  for (const child of Object.values(record)) collectClassNames(child, out);
  return out;
}

describe("tokenizeFile", () => {
  it("produces Prism token classes for TSX diffs", () => {
    const [file] = parseUnifiedDiff(`diff --git a/demo.tsx b/demo.tsx
index 1111111..2222222 100644
--- a/demo.tsx
+++ b/demo.tsx
@@ -1 +1 @@
-const foo = 1;
+const bar = 2;
`);

    expect(file).toBeDefined();

    const tokens = tokenizeFile(file);
    const classNames = collectClassNames(tokens);

    expect(tokens).toBeDefined();
    expect(classNames.has("token")).toBe(true);
    expect(classNames.has("keyword")).toBe(true);
  });

  it("returns undefined for unsupported file extensions", () => {
    const [file] = parseUnifiedDiff(`diff --git a/demo.foo b/demo.foo
index 1111111..2222222 100644
--- a/demo.foo
+++ b/demo.foo
@@ -1 +1 @@
-alpha
+beta
`);

    expect(tokenizeFile(file)).toBeUndefined();
  });
});
