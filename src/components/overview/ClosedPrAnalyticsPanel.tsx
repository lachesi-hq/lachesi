import { ArrowLeft, ArrowsClockwise, ChartLineUp } from "@phosphor-icons/react";
import { useMemo } from "react";
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
import type { ClosedPrMetric } from "@/types";

interface ClosedPrAnalyticsPanelProps {
  metrics: ClosedPrMetric[];
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncedCount: number;
  onBack: () => void;
  onSync: () => void;
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
  return new Intl.NumberFormat().format(Math.round(value));
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

export function ClosedPrAnalyticsPanel({
  metrics,
  loading,
  syncing,
  error,
  lastSyncedCount,
  onBack,
  onSync,
  onSelectPr,
}: ClosedPrAnalyticsPanelProps) {
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

    for (const metric of metrics) {
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
      authorData: topCounts(authorCounts, 8),
      repoData: topCounts(repoCounts, 8),
      repoChurnData: topCounts(repoChurn, 8),
      categoryData: topCounts(categoryCounts, 8),
      weekData: [...weekCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week, count]) => ({ week, count })),
      totalChurn,
      avgFiles: metrics.length > 0 ? filesChanged / metrics.length : 0,
      avgLeadTime: metrics.length > 0 ? leadTime / metrics.length : 0,
      withAi,
      highImpact,
      largest: [...metrics]
        .sort((a, b) => churn(b) - churn(a) || b.filesChanged - a.filesChanged)
        .slice(0, 10),
    };
  }, [metrics]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
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
            {metrics.length} cached PR{metrics.length === 1 ? "" : "s"}
          </span>
        </div>
        <Button variant="secondary" size="sm" onClick={onSync} disabled={syncing}>
          <ArrowsClockwise size={14} className={syncing ? "animate-spin" : undefined} />
          Sync
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && metrics.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Loading cached metrics...
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            {lastSyncedCount > 0 && (
              <div className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                Synced {lastSyncedCount} recent closed PR metrics into the local cache.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <StatCard label="Closed PRs" value={metrics.length} sub="cached locally" />
              <StatCard
                label="Total churn"
                value={formatNumber(analytics.totalChurn)}
                sub="added + removed lines"
              />
              <StatCard
                label="Avg files"
                value={metrics.length > 0 ? analytics.avgFiles.toFixed(1) : "—"}
                sub="changed per PR"
              />
              <StatCard
                label="Avg close time"
                value={metrics.length > 0 ? formatDays(analytics.avgLeadTime) : "—"}
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
              <div className="text-sm font-semibold">Largest closed PRs</div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
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
                    {analytics.largest.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No cached closed PRs. Run Sync to collect recent metrics.
                        </td>
                      </tr>
                    ) : (
                      analytics.largest.map((metric) => (
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
