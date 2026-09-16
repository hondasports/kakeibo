/**
 * lineWebhookEvents / lineImageJobs の保持期限 cleanup ユースケース。
 * events→jobs の順にバッチ削除し、満杯なら自分を再スケジュールする。
 */
import type { LineImageJobStore } from "../../domain/lineWebhook/imageJobStore";
import type { LineWebhookScheduler } from "../../domain/lineWebhook/scheduler";
import type { LineWebhookEventStore } from "../../domain/lineWebhook/webhookEventStore";

export const LINE_WEBHOOK_EVENT_RETENTION_DAYS = 30;
const CLEANUP_BATCH_SIZE = 100;

export type CleanupOldEventsDeps = {
  webhookEvents: LineWebhookEventStore;
  imageJobs: LineImageJobStore;
  scheduler: LineWebhookScheduler;
};

export async function cleanupOldEvents(deps: CleanupOldEventsDeps): Promise<void> {
  const cutoff = Date.now() - LINE_WEBHOOK_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const events = await deps.webhookEvents.takeOlderThan(cutoff, CLEANUP_BATCH_SIZE);

  for (const event of events) await deps.webhookEvents.deleteById(event.id);

  if (events.length === CLEANUP_BATCH_SIZE) {
    await deps.scheduler.scheduleCleanup();
    return;
  }

  const jobs = await deps.imageJobs.takeOlderThan(cutoff, CLEANUP_BATCH_SIZE);

  for (const job of jobs) await deps.imageJobs.deleteById(job.id);

  if (jobs.length === CLEANUP_BATCH_SIZE) {
    await deps.scheduler.scheduleCleanup();
  }
}
