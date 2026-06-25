/** True when a plain-key shortcut should be ignored (typing, modifiers, open dialog). */
export function shouldIgnoreShortcut(e: KeyboardEvent): boolean {
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  const target = e.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
      return true;
    }
  }
  if (
    typeof document !== "undefined" &&
    document.querySelector('[role="dialog"][data-state="open"]')
  ) {
    return true;
  }
  return false;
}
