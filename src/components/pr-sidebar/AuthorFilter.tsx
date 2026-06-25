import { User } from "@phosphor-icons/react";

export interface AuthorOption {
  key: string;
  label: string;
  isMe: boolean;
}

export interface AuthorFilterProps {
  authors: AuthorOption[];
  value: string | null;
  onChange: (key: string | null) => void;
}

export function AuthorFilter({ authors, value, onChange }: AuthorFilterProps) {
  if (authors.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <User size={13} className="shrink-0 text-muted-foreground" />
      <select
        aria-label="Filter by author"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All authors</option>
        {authors.map((a) => (
          <option key={a.key} value={a.key}>
            {a.isMe ? `${a.label} (me)` : a.label}
          </option>
        ))}
      </select>
    </div>
  );
}
