import {
  mockComments,
  mockDiffstat,
  mockPullRequestDetail,
  mockPullRequests,
  mockRawDiff,
} from "@/mock-tauri/fixtures";
import type { DiffstatEntry, PrComment, PullRequestDetail, PullRequestSummary } from "@/types";

/**
 * Storybook fixtures. Clone the canonical mock data so a story (or play test)
 * can mutate its copy without leaking state into other stories.
 */
export function clonePullRequests(): PullRequestSummary[] {
  return mockPullRequests.map((pr) => ({ ...pr }));
}

export function clonePullRequestDetail(): PullRequestDetail {
  return {
    ...mockPullRequestDetail,
    reviewers: mockPullRequestDetail.reviewers.map((r) => ({ ...r })),
  };
}

export function cloneDiffstat(): DiffstatEntry[] {
  return mockDiffstat.map((d) => ({ ...d }));
}

export function cloneComments(): PrComment[] {
  return mockComments.map((c) => ({ ...c, inline: c.inline ? { ...c.inline } : null }));
}

export const sampleRawDiff = mockRawDiff;
