import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomaticSyncIntervalSeconds } from "@/types";
import { useAutomaticSyncPolling } from "./useAutomaticSyncPolling";

interface PollingProps {
  enabled: boolean;
  intervalSeconds: AutomaticSyncIntervalSeconds | null;
}

describe("useAutomaticSyncPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when disabled or set to off", () => {
    const onSync = vi.fn().mockResolvedValue(undefined);
    const initialProps: PollingProps = { enabled: true, intervalSeconds: null };

    const { rerender } = renderHook(
      ({ enabled, intervalSeconds }: PollingProps) =>
        useAutomaticSyncPolling({
          enabled,
          intervalSeconds,
          contextKey: "repo-a",
          onSync,
        }),
      { initialProps },
    );

    vi.advanceTimersByTime(60_000);
    expect(onSync).not.toHaveBeenCalled();

    rerender({ enabled: false, intervalSeconds: 30 });
    vi.advanceTimersByTime(60_000);
    expect(onSync).not.toHaveBeenCalled();
  });

  it("applies interval changes without restarting the app", () => {
    const onSync = vi.fn().mockResolvedValue(undefined);

    const { rerender } = renderHook(
      ({ intervalSeconds }: { intervalSeconds: AutomaticSyncIntervalSeconds | null }) =>
        useAutomaticSyncPolling({
          enabled: true,
          intervalSeconds,
          contextKey: "repo-a",
          onSync,
        }),
      { initialProps: { intervalSeconds: 60 } },
    );

    vi.advanceTimersByTime(30_000);
    expect(onSync).not.toHaveBeenCalled();

    rerender({ intervalSeconds: 30 });
    vi.advanceTimersByTime(30_000);
    expect(onSync).toHaveBeenCalledTimes(1);
  });

  it("does not overlap polling sync runs", async () => {
    let resolveSync: () => void = () => {};
    const onSync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSync = resolve;
        }),
    );

    renderHook(() =>
      useAutomaticSyncPolling({
        enabled: true,
        intervalSeconds: 30,
        contextKey: "repo-a",
        onSync,
      }),
    );

    vi.advanceTimersByTime(30_000);
    expect(onSync).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30_000);
    expect(onSync).toHaveBeenCalledTimes(1);

    resolveSync();
    await Promise.resolve();
    await Promise.resolve();

    vi.advanceTimersByTime(30_000);
    expect(onSync).toHaveBeenCalledTimes(2);
  });
});
