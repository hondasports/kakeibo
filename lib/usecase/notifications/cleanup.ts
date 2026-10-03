import {
  LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  LINE_NOTIFICATION_RETENTION_MS,
} from "../../domain/notifications/rules";
import { TERMINAL_LINE_NOTIFICATION_JOB_STATUSES } from "../../domain/notifications/records";
import type { CleanupLineNotificationDeps } from "./deps";

export async function cleanupOldLineNotificationJobs(
  deps: CleanupLineNotificationDeps,
): Promise<void> {
  const now = (deps.now ?? Date.now)();
  const cutoff = now - LINE_NOTIFICATION_RETENTION_MS;

  let hasMore = false;
  for (const status of TERMINAL_LINE_NOTIFICATION_JOB_STATUSES) {
    const batch = await deps.jobs.listTerminalJobsUpdatedBefore(
      status,
      cutoff,
      LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
    );
    for (const job of batch) {
      await deps.jobs.delete(job.id);
    }
    hasMore ||= batch.length === LINE_NOTIFICATION_CLEANUP_BATCH_SIZE;
  }

  const eventBatch = await deps.lineEvents.listCreatedBefore(
    cutoff,
    LINE_NOTIFICATION_CLEANUP_BATCH_SIZE,
  );
  for (const event of eventBatch) {
    await deps.lineEvents.delete(event.id);
  }
  hasMore ||= eventBatch.length === LINE_NOTIFICATION_CLEANUP_BATCH_SIZE;

  if (hasMore) {
    await deps.scheduler.scheduleCleanup(0);
  }
}
