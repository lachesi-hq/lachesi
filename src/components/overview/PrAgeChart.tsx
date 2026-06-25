import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PullRequestSummary } from "@/types";
import { AGE_BUCKETS, type AgeBucket, ageBucket, prAgeDays } from "./prAge";

interface PrAgeChartProps {
  pullRequests: PullRequestSummary[];
}

export function PrAgeChart({ pullRequests }: PrAgeChartProps) {
  const counts = new Map<AgeBucket, number>(AGE_BUCKETS.map((b) => [b, 0]));
  for (const pr of pullRequests) {
    const bucket = ageBucket(prAgeDays(pr.createdOn));
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const data = AGE_BUCKETS.map((bucket) => ({ bucket, count: counts.get(bucket) ?? 0 }));

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-sm font-semibold">PR by age</div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} barSize={28}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={24}
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
            formatter={(value) => [value, "PRs"]}
          />
          <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
