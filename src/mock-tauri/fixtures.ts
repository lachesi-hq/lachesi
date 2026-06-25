import type {
  AppConfig,
  DiffstatEntry,
  PrComment,
  PullRequestDetail,
  PullRequestSummary,
} from "@/types";

export const mockConfig: AppConfig = {
  repos: [
    {
      workspace: "example-workspace",
      repo: "frontend-app",
      localPath: "/Users/alex/dev/example/frontend-app",
    },
    { workspace: "example-workspace", repo: "backend-api", localPath: null },
  ],
  defaultDiffView: "unified",
  theme: "dark",
  reviewTerminal: null,
  claudeModel: "sonnet",
  claudeEffort: "high",
  jiraBaseUrl: "https://example.atlassian.net",
  menuBarSyncEnabled: true,
  notificationsEnabled: false,
  configured: true,
  hasCredentials: true,
  hasJira: true,
  hasNotion: true,
};

const RAW_PULL_REQUESTS: Omit<PullRequestSummary, "workspace" | "repo" | "draft">[] = [
  {
    id: 1732,
    title: "[Draft] feat(compliance): add IATF 16949 certification column",
    authorDisplayName: "Sam Author",
    sourceBranch: "feat/iatf-16949",
    destinationBranch: "develop",
    state: "OPEN",
    commentCount: 3,
    createdOn: "2026-06-17T08:00:00.000Z",
    updatedOn: "2026-06-17T09:12:00.000Z",
    reviewers: [
      { displayName: "Alex Reviewer", accountId: "alex", approved: false },
      { displayName: "Jamie Reviewer", accountId: "jamie", approved: true },
    ],
  },
  {
    id: 1731,
    title: "CB-2066 - fix category drill-down returning empty orders",
    authorDisplayName: "Alex Reviewer",
    sourceBranch: "CB-2066-category-drilldown",
    destinationBranch: "develop",
    state: "OPEN",
    commentCount: 0,
    createdOn: "2026-06-16T09:00:00.000Z",
    updatedOn: "2026-06-16T15:40:00.000Z",
    reviewers: [{ displayName: "Alex Reviewer", accountId: "alex", approved: true }],
  },
  {
    id: 1729,
    title: "CB-000 - refactor supplier-management stories to MSW string patterns",
    authorDisplayName: "Alex Reviewer",
    sourceBranch: "CB-000-msw-stories",
    destinationBranch: "develop",
    state: "OPEN",
    commentCount: 5,
    createdOn: "2026-06-13T10:30:00.000Z",
    updatedOn: "2026-06-15T11:02:00.000Z",
  },
  {
    id: 1728,
    title: "CB-000 - fix i18n loader and auth token in Storybook runtime",
    authorDisplayName: "Alex Reviewer",
    sourceBranch: "CB-000-storybook-i18n",
    destinationBranch: "develop",
    state: "OPEN",
    commentCount: 1,
    createdOn: "2026-06-10T07:45:00.000Z",
    updatedOn: "2026-06-14T08:25:00.000Z",
  },
  {
    id: 1702,
    title: "CB-1791 - Connect orders and order details postgresql component",
    authorDisplayName: "Alex Reviewer",
    sourceBranch: "CB-1791-orders-pg",
    destinationBranch: "develop",
    state: "OPEN",
    commentCount: 12,
    createdOn: "2026-06-03T14:20:00.000Z",
    updatedOn: "2026-06-10T17:55:00.000Z",
  },
];

export const mockPullRequests: PullRequestSummary[] = RAW_PULL_REQUESTS.map((pr) => ({
  ...pr,
  draft: pr.title.startsWith("[Draft]"),
  workspace: "example-workspace",
  repo: "frontend-app",
}));

export const mockPullRequestDetail: PullRequestDetail = {
  id: 1731,
  title: "CB-2066 - fix category drill-down returning empty orders",
  descriptionRaw:
    "Category drill-down was passing the Postgres token instead of the ERP category code.\n\nThis PR adds `categoryErpId` to the budget row and uses it for the categories lookup.",
  state: "OPEN",
  draft: false,
  authorDisplayName: "Alex Reviewer",
  reviewers: [
    { displayName: "Alex Reviewer", accountId: "alex", approved: false },
    { displayName: "Jamie Reviewer", accountId: "jamie", approved: true },
  ],
  sourceBranch: "CB-2066-category-drilldown",
  destinationBranch: "develop",
  createdOn: "2026-06-16T09:00:00.000Z",
  updatedOn: "2026-06-16T15:40:00.000Z",
};

export const mockDiffstat: DiffstatEntry[] = [
  {
    status: "modified",
    linesAdded: 21,
    linesRemoved: 4,
    oldPath: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.spec.ts",
    newPath: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.spec.ts",
  },
  {
    status: "modified",
    linesAdded: 19,
    linesRemoved: 4,
    oldPath: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts",
    newPath: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts",
  },
  {
    status: "added",
    linesAdded: 12,
    linesRemoved: 0,
    oldPath: null,
    newPath: "src/app/dashboard/budget/types/BudgetAnalyticsItem.ts",
  },
];

/** A small, real-shaped unified diff used for diff-viewer stories/tests. */
export const mockRawDiff = `diff --git a/src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts b/src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts
index 5fdfc9cb3..154929261 100644
--- a/src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts
+++ b/src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts
@@ -13,9 +13,12 @@ export function buildOrdersUrlFromBudgetRow(
   const params = new URLSearchParams();
   params.set("tab", "lines");

-  params.set("orderCategories", row.key);
+  // Use the ERP category code, not the Postgres token (CB-2066).
+  params.set("orderCategories", row.categoryErpId);
+  params.set("categories", row.categoryErpId);
   return \`/\${lang}/dashboard/orders?\${params.toString()}\`;
 }
`;

export const mockComments: PrComment[] = [
  {
    id: 9001,
    parentId: null,
    contentRaw: "Should we guard against `categoryErpId` being undefined here?",
    userDisplayName: "Sam Author",
    createdOn: "2026-06-16T16:10:00.000Z",
    deleted: false,
    inline: {
      path: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts",
      to: 17,
      from: null,
    },
  },
  {
    id: 9002,
    parentId: 9001,
    contentRaw: "Good catch — the row type now makes it required, so it can't be undefined.",
    userDisplayName: "Alex Reviewer",
    createdOn: "2026-06-16T16:25:00.000Z",
    deleted: false,
    inline: {
      path: "src/app/dashboard/budget/utils/buildOrdersUrlFromBudgetRow.ts",
      to: 17,
      from: null,
    },
  },
];
