import { GitBranch } from "@phosphor-icons/react";

export interface RepositoryOption {
  key: string;
  label: string;
  count: number;
}

export interface RepositoryFilterProps {
  repositories: RepositoryOption[];
  value: string | null;
  onChange: (key: string | null) => void;
}

export function RepositoryFilter({ repositories, value, onChange }: RepositoryFilterProps) {
  if (repositories.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
      <GitBranch size={13} className="shrink-0 text-muted-foreground" />
      <select
        aria-label="Filter by repository"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All repositories</option>
        {repositories.map((repo) => (
          <option key={repo.key} value={repo.key}>
            {repo.label} ({repo.count})
          </option>
        ))}
      </select>
    </div>
  );
}
