import { describe, expect, it, vi } from "vitest";
import { TERMINAL_LINE_NOTIFICATION_JOB_STATUSES } from "../../domain/notifications/records";
import {
  LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  LINE_NOTIFICATION_RETENTION_MS,
} from "../../domain/notifications/rules";
import { cleanupOldLineNotificationJobs } from "./cleanup";

const NOW = 1_000_000_000_000;

function makeDeps({ terminalJobs = [] as { id: string }[] } = {}) {
  const listTerminalJobsUpdatedBefore = vi
    .fn()
    .mockImplementation(async (status: string) =>
      status === TERMINAL_LINE_NOTIFICATION_JOB_STATUSES[0] ? terminalJobs : [],
    );
  const jobs = {
    getJob: vi.fn(),
    findByBatchId: vi.fn(),
    listTerminalJobsUpdatedBefore,
    insert: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const scheduler = { scheduleCleanup: vi.fn().mockResolvedValue(undefined) };
  return { deps: { jobs, scheduler, now: () => NOW }, jobs, scheduler };
}

describe("cleanupOldLineNotificationJobs", () => {
  it("deletes only terminal jobs older than the 30-day retention cutoff", async () => {
    const { deps, jobs } = makeDeps({
      terminalJobs: [{ id: "old-1" }, { id: "old-2" }],
    });
    await cleanupOldLineNotificationJobs(deps);

    const cutoff = NOW - LINE_NOTIFICATION_RETENTION_MS;
    for (const status of TERMINAL_LINE_NOTIFICATION_JOB_STATUSES) {
      expect(jobs.listTerminalJobsUpdatedBefore).toHaveBeenCalledWith(
        status,
        cutoff,
        LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
      );
    }
    expect(jobs.listTerminalJobsUpdatedBefore).toHaveBeenCalledTimes(
      TERMINAL_LINE_NOTIFICATION_JOB_STATUSES.length,
    );
    expect(jobs.delete).toHaveBeenCalledTimes(2);
    expect(jobs.delete).toHaveBeenNthCalledWith(1, "old-1");
    expect(jobs.delete).toHaveBeenNthCalledWith(2, "old-2");
    expect(deps.scheduler.scheduleCleanup).not.toHaveBeenCalled();
  });

  it("does not delete anything when no terminal jobs exceed retention", async () => {
    const { deps, jobs } = makeDeps({ terminalJobs: [] });
    await cleanupOldLineNotificationJobs(deps);
    expect(jobs.delete).not.toHaveBeenCalled();
    expect(deps.scheduler.scheduleCleanup).not.toHaveBeenCalled();
  });

  it("reschedules itself when a full bounded batch was deleted", async () => {
    const terminalJobs = Array.from({ length: LINE_NOTIFICATION_CLEANUP_BATCH_SIZE }, (_, i) => ({
      id: `old-${i}`,
    }));
    const { deps, scheduler } = makeDeps({ terminalJobs });
    await cleanupOldLineNotificationJobs(deps);
    expect(deps.jobs.delete).toHaveBeenCalledTimes(LINE_NOTIFICATION_CLEANUP_BATCH_SIZE);
    expect(scheduler.scheduleCleanup).toHaveBeenCalledWith(0);
  });
});
