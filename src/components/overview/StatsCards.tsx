import type { PullRequestSummary } from "@/types";
import { prAgeDays } from "./prAge";

interface StatsCardsProps {
  pullRequests: PullRequestSummary[];
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function StatsCards({ pullRequests }: StatsCardsProps) {
  const open = pullRequests.filter((pr) => !pr.draft);
  const drafts = pullRequests.filter((pr) => pr.draft);

  const ages = pullRequests.map((pr) => prAgeDays(pr.createdOn));
  const maxAge = ages.length > 0 ? Math.max(...ages) : 0;
  const avgAge = ages.length > 0 ? ages.reduce((s, a) => s + a, 0) / ages.length : 0;

  function fmtDays(d: number): string {
    if (d < 1) return "< 1d";
    const days = Math.floor(d);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    const rem = days % 7;
    return rem > 0 ? `${weeks}w ${rem}d` : `${weeks}w`;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Open PRs"
        value={open.length}
        sub={`${pullRequests.length} total incl. drafts`}
      />
      <StatCard
        label="Draft PRs"
        value={drafts.length}
        sub={drafts.length === 0 ? "No drafts" : "Not ready for review"}
      />
      <StatCard
        label="Oldest PR"
        value={pullRequests.length > 0 ? fmtDays(maxAge) : "—"}
        sub={pullRequests.length > 0 ? "since opened" : "No open PRs"}
      />
      <StatCard
        label="Avg Age"
        value={pullRequests.length > 0 ? fmtDays(avgAge) : "—"}
        sub={pullRequests.length > 0 ? "per open PR" : "No open PRs"}
      />
    </div>
  );
}
