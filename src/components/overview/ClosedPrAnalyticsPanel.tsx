import { ArrowLeft, ArrowsClockwise, ChartLineUp, MagnifyingGlass, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authorKey } from "@/hooks/useCurrentUser";
import type {
  ClosedPrAnalyticsSyncOptions,
  ClosedPrAnalyticsSyncResult,
  ClosedPrMetric,
} from "@/types";
import { repoKey } from "@/types";

interface ClosedPrAnalyticsPanelProps {
  metrics: ClosedPrMetric[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSync: ClosedPrAnalyticsSyncResult | null;
  repositoryFilter: string | null;
  authorFilter: string | null;
  onBack: () => void;
  onSync: (options: ClosedPrAnalyticsSyncOptions) => void;
  onSelectPr: (pr: { workspace: string; repo: string; id: number }) => void;
}

interface StatCardProps {
  label: string;
  value: string | number;
  sub: string;
}

interface CountDatum {
  label: string;
  count: number;
}

const COLORS = [
  "var(--accent-foreground)",
  "hsl(173 58% 39%)",
  "hsl(43 74% 44%)",
  "hsl(27 87% 54%)",
  "var(--destructive)",
];
const SYNC_WINDOWS = [14, 30, 90] as const;
const DEFAULT_SYNC_DAYS_BACK = 30;
const SYNC_LIMIT_PER_STATE = 10;
const NUMBER_FORMATTER = new Intl.NumberFormat();
const DAY_MS = 24 * 60 * 60 * 1000;

function churn(metric: ClosedPrMetric): number {
  return metric.additions + metric.deletions;
}

function daysBetween(start: string, end: string): number {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return (endMs - startMs) / 86_400_000;
}

function formatDays(days: number): string {
  if (days < 1) return "< 1d";
  if (days < 10) return `${days.toFixed(1)}d`;
  return `${Math.round(days)}d`;
}

function formatNumber(value: number): string {
  return NUMBER_FORMATTER.format(Math.round(value));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function weekKey(date: string): string {
  const current = new Date(date);
  if (Number.isNaN(current.getTime())) return "Unknown";
  const start = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const day = Math.floor((current.getTime() - start.getTime()) / 86_400_000);
  const week = Math.floor((day + start.getUTCDay()) / 7) + 1;
  return `${current.getUTCFullYear()} W${String(week).padStart(2, "0")}`;
}

function impactVariant(
  impact: ClosedPrMetric["risk"]["impact"],
): "success" | "secondary" | "muted" {
  if (impact === "high") return "success";
  if (impact === "medium") return "secondary";
  return "muted";
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function BreakdownChart({
  title,
  data,
  empty,
  valueLabel,
}: {
  title: string;
  data: CountDatum[];
  empty: string;
  valueLabel: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-sm font-semibold">{title}</div>
      {data.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-muted-foreground">
          {empty}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} layout="vertical" barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={128}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
              formatter={(value) => [value, valueLabel]}
            />
            <Bar dataKey="count" minPointSize={4} radius={[0, 4, 4, 0]}>
              {data.map((item, index) => (
                <Cell key={item.label} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function addCount(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function topCounts(map: Map<string, number>, limit: number): CountDatum[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function matchesPrQuery(metric: ClosedPrMetric, query: string): boolean {
  if (!query) return true;
  return [
    metric.title,
    String(metric.prId),
    metric.authorDisplayName,
    metric.repo,
    metric.workspace,
    metric.sourceBranch,
    metric.destinationBranch,
    metric.state,
  ].some((value) => value.toLowerCase().includes(query));
}

export function ClosedPrAnalyticsPanel({
  metrics,
  loading,
  syncing,
  error,
  lastSync,
  repositoryFilter,
  authorFilter,
  onBack,
  onSync,
  onSelectPr,
}: ClosedPrAnalyticsPanelProps) {
  const [syncDaysBack, setSyncDaysBack] = useState<number>(DEFAULT_SYNC_DAYS_BACK);
  const [prQuery, setPrQuery] = useState("");
  const filteredMetrics = useMemo(() => {
    const minUpdatedAt = Date.now() - syncDaysBack * DAY_MS;
    const query = prQuery.trim().toLowerCase();
    return metrics.filter((metric) => {
      const updatedAt = new Date(metric.updatedOn).getTime();
      const inRange = !Number.isFinite(updatedAt) || updatedAt >= minUpdatedAt;
      const inRepo =
        repositoryFilter == null ||
        repoKey({ workspace: metric.workspace, repo: metric.repo }) === repositoryFilter;
      const inAuthor =
        authorFilter == null ||
        authorKey(metric.authorAccountId, metric.authorDisplayName) === authorFilter;
      return inRange && inRepo && inAuthor && matchesPrQuery(metric, query);
    });
  }, [authorFilter, metrics, prQuery, repositoryFilter, syncDaysBack]);
  const analytics = useMemo(() => {
    const authorCounts = new Map<string, number>();
    const repoCounts = new Map<string, number>();
    const repoChurn = new Map<string, number>();
    const weekCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    let totalChurn = 0;
    let filesChanged = 0;
    let leadTime = 0;
    let withAi = 0;
    let highImpact = 0;

    for (const metric of filteredMetrics) {
      addCount(authorCounts, metric.authorDisplayName || "Unknown");
      addCount(repoCounts, metric.repo);
      addCount(repoChurn, metric.repo, churn(metric));
      addCount(weekCounts, weekKey(metric.updatedOn));
      for (const category of metric.risk.categoryCounts) {
        addCount(categoryCounts, category.key, category.count);
      }
      totalChurn += churn(metric);
      filesChanged += metric.filesChanged;
      leadTime += daysBetween(metric.createdOn, metric.updatedOn);
      if (metric.risk.hasAiReview) withAi += 1;
      if (metric.risk.impact === "high") highImpact += 1;
    }

    return {
      authorData: topCounts(authorCounts, authorCounts.size),
      repoData: topCounts(repoCounts, 8),
      repoChurnData: topCounts(repoChurn, 8),
      categoryData: topCounts(categoryCounts, 8),
      weekData: [...weekCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, count]) => ({ week, count })),
      totalChurn,
      avgFiles: filteredMetrics.length > 0 ? filesChanged / filteredMetrics.length : 0,
      avgLeadTime: filteredMetrics.length > 0 ? leadTime / filteredMetrics.length : 0,
      withAi,
      highImpact,
      tableRows: [...filteredMetrics].sort(
        (a, b) =>
          new Date(b.updatedOn).getTime() - new Date(a.updatedOn).getTime() || churn(b) - churn(a),
      ),
    };
  }, [filteredMetrics]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1.5"
          aria-label="Back to PR list"
        >
          <ArrowLeft size={14} />
          PR list
        </Button>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-semibold">Closed PR analytics</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {filteredMetrics.length === metrics.length
              ? `${metrics.length} cached PR${metrics.length === 1 ? "" : "s"}`
              : `${filteredMetrics.length} of ${metrics.length} cached PRs`}
          </span>
        </div>
        <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/50 p-0.5">
            {SYNC_WINDOWS.map((days) => (
              <Button
                key={days}
                type="button"
                variant={syncDaysBack === days ? "secondary" : "ghost"}
                size="sm"
                className="h-7 px-2"
                disabled={syncing}
                onClick={() => setSyncDaysBack(days)}
                aria-pressed={syncDaysBack === days}
              >
                {days}d
              </Button>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onSync({ daysBack: syncDaysBack, limitPerState: SYNC_LIMIT_PER_STATE })}
            disabled={syncing}
          >
            <ArrowsClockwise size={14} className={syncing ? "animate-spin" : undefined} />
            {syncing ? "Syncing" : "Sync"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && metrics.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading cached metrics...
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <MagnifyingGlass
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  type="search"
                  value={prQuery}
                  onChange={(event) => setPrQuery(event.target.value)}
                  placeholder="Filter PR title, ID, branch, author"
                  aria-label="Filter closed pull requests"
                  className="pl-9 pr-9"
                />
                {prQuery && (
                  <button
                    type="button"
                    onClick={() => setPrQuery("")}
                    className="absolute right-2 top-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label="Clear closed pull request filter"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="whitespace-nowrap text-xs text-muted-foreground">
                {filteredMetrics.length} shown
              </div>
            </div>
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {syncing && (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                Syncing closed PRs updated in the last {syncDaysBack} days, up to{" "}
                {SYNC_LIMIT_PER_STATE} PRs per state per repo.
              </div>
            )}
            {lastSync && !syncing && (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                {lastSync.syncedCount > 0
                  ? `Synced ${lastSync.syncedCount} closed PR metrics from the last ${lastSync.daysBack} days.`
                  : `No closed PRs found in the last ${lastSync.daysBack} days.`}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Closed PRs" value={filteredMetrics.length} sub="shown locally" />
              <StatCard
                label="Total churn"
                value={formatNumber(analytics.totalChurn)}
                sub="added + removed lines"
              />
              <StatCard
                label="Avg files"
                value={filteredMetrics.length > 0 ? analytics.avgFiles.toFixed(1) : "—"}
                sub="changed per PR"
              />
              <StatCard
                label="Avg close time"
                value={filteredMetrics.length > 0 ? formatDays(analytics.avgLeadTime) : "—"}
                sub="created to updated"
              />
              <StatCard
                label="AI reviewed"
                value={analytics.withAi}
                sub={`${analytics.highImpact} high impact`}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <BreakdownChart
                title="Closed PRs by author"
                data={analytics.authorData}
                empty="No closed PR metrics cached"
                valueLabel="PRs"
              />
              <BreakdownChart
                title="Repo activity"
                data={analytics.repoData}
                empty="No repository activity cached"
                valueLabel="PRs"
              />
              <BreakdownChart
                title="Churn by repo"
                data={analytics.repoChurnData}
                empty="No diffstat metrics cached"
                valueLabel="changed lines"
              />
              <BreakdownChart
                title="AI risk categories"
                data={analytics.categoryData}
                empty="No structured AI findings cached"
                valueLabel="findings"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ChartLineUp size={15} />
                PR frequency by week
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={analytics.weekData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="week"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(value) => [value, "closed PRs"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="var(--accent-foreground)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">Closed PRs</div>
                <div className="text-xs text-muted-foreground">
                  {analytics.tableRows.length} matching row
                  {analytics.tableRows.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[1320px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        PR
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        Author
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        Repo
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        Opened
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        Closed
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        + / -
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">
                        Files
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground">
                        Risk
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.tableRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                          No closed PRs match the current filters.
                        </td>
                      </tr>
                    ) : (
                      analytics.tableRows.map((metric) => (
                        <tr
                          key={`${metric.workspace}/${metric.repo}/${metric.prId}`}
                          className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40"
                          onClick={() =>
                            onSelectPr({
                              workspace: metric.workspace,
                              repo: metric.repo,
                              id: metric.prId,
                            })
                          }
                        >
                          <td className="max-w-sm px-4 py-2.5">
                            <div className="flex min-w-0 flex-col gap-1">
                              <span className="truncate font-medium">{metric.title}</span>
                              <span className="text-xs text-muted-foreground">
                                #{metric.prId} · {metric.state.toLowerCase()} ·{" "}
                                {formatDays(daysBetween(metric.createdOn, metric.updatedOn))}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {metric.authorDisplayName || "Unknown"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {metric.repo}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {formatDate(metric.createdOn)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                            {formatDate(metric.updatedOn)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                            <span className="text-[var(--success)]">+{metric.additions}</span>
                            <span className="text-muted-foreground"> / </span>
                            <span className="text-destructive">-{metric.deletions}</span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {metric.diffstatCached ? metric.filesChanged : "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={impactVariant(metric.risk.impact)}>
                                {metric.risk.impact}
                              </Badge>
                              {metric.risk.hasAiReview ? (
                                <span className="text-xs text-muted-foreground">
                                  {metric.risk.totalFindings} findings
                                </span>
                              ) : (
                                <Badge variant="outline">No AI</Badge>
                              )}
                              {!metric.diffstatCached && (
                                <Badge variant="outline">No diffstat</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
