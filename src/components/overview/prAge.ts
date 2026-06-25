/** Returns the age of a PR in fractional days from its createdOn ISO string. */
export function prAgeDays(createdOn: string): number {
  const created = new Date(createdOn).getTime();
  const now = Date.now();
  return (now - created) / (1000 * 60 * 60 * 24);
}

/** Human-readable age label. */
export function formatAge(days: number): string {
  if (days < 1) return "< 1d";
  if (days < 2) return "1d";
  const rounded = Math.floor(days);
  if (rounded < 7) return `${rounded}d`;
  const weeks = Math.floor(rounded / 7);
  return weeks === 1 ? "1w" : `${weeks}w`;
}

export type AgeBucket = "< 1d" | "1–3d" | "4–7d" | "1–2w" | "> 2w";

export function ageBucket(days: number): AgeBucket {
  if (days < 1) return "< 1d";
  if (days <= 3) return "1–3d";
  if (days <= 7) return "4–7d";
  if (days <= 14) return "1–2w";
  return "> 2w";
}

export const AGE_BUCKETS: AgeBucket[] = ["< 1d", "1–3d", "4–7d", "1–2w", "> 2w"];
