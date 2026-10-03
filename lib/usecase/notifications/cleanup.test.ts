import { describe, expect, it, vi } from "vitest";
import { TERMINAL_LINE_NOTIFICATION_JOB_STATUSES } from "../../domain/notifications/records";
import {
  LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  LINE_NOTIFICATION_RETENTION_MS,
} from "../../domain/notifications/rules";
import { cleanupOldLineNotificationJobs } from "./cleanup";

const NOW = 1_000_000_000_000;

function makeDeps({
  terminalJobs = [] as { id: string }[],
  terminalJobsByStatus = {} as Partial<Record<string, { id: string }[]>>,
  oldEvents = [] as { id: string }[],
} = {}) {
  const listTerminalJobsUpdatedBefore = vi
    .fn()
    .mockImplementation(
      async (status: string) =>
        terminalJobsByStatus[status] ??
        (status === TERMINAL_LINE_NOTIFICATION_JOB_STATUSES[0] ? terminalJobs : []),
    );
  const jobs = {
    getJob: vi.fn(),
    findByBatchId: vi.fn(),
    listTerminalJobsUpdatedBefore,
    listJobsByStatusUpdatedBefore: vi.fn(),
    listDueRetryingJobs: vi.fn(),
    listExpiredProcessingJobs: vi.fn(),
    insert: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const lineEvents = {
    findByDedupeKey: vi.fn(),
    listCreatedBefore: vi.fn().mockResolvedValue(oldEvents),
    insert: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const scheduler = { scheduleCleanup: vi.fn().mockResolvedValue(undefined) };
  return { deps: { jobs, lineEvents, scheduler, now: () => NOW }, jobs, lineEvents, scheduler };
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

  it("deletes consumed LINE notification events after the same retention cutoff", async () => {
    const { deps, lineEvents } = makeDeps({ oldEvents: [{ id: "event-1" }] });
    await cleanupOldLineNotificationJobs(deps);

    expect(lineEvents.listCreatedBefore).toHaveBeenCalledWith(
      NOW - LINE_NOTIFICATION_RETENTION_MS,
      LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
    );
    expect(lineEvents.delete).toHaveBeenCalledWith("event-1");
  });

  it("reschedules itself when a full event batch was deleted", async () => {
    const oldEvents = Array.from({ length: LINE_NOTIFICATION_CLEANUP_BATCH_SIZE }, (_, i) => ({
      id: `event-${i}`,
    }));
    const { deps, scheduler } = makeDeps({ oldEvents });
    await cleanupOldLineNotificationJobs(deps);
    expect(scheduler.scheduleCleanup).toHaveBeenCalledWith(0);
  });

  it("statusをまたいだ合計がbatch sizeに達しても再スケジュールしない", async () => {
    const { deps, scheduler } = makeDeps({
      terminalJobsByStatus: {
        sent: [{ id: "sent-1" }, { id: "sent-2" }],
        failed: Array.from({ length: LINE_NOTIFICATION_CLEANUP_BATCH_SIZE - 2 }, (_, i) => ({
          id: `failed-${i}`,
        })),
      },
    });
    await cleanupOldLineNotificationJobs(deps);
    expect(deps.jobs.delete).toHaveBeenCalledTimes(LINE_NOTIFICATION_CLEANUP_BATCH_SIZE);
    expect(scheduler.scheduleCleanup).not.toHaveBeenCalled();
  });
});
