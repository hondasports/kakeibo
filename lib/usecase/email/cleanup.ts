import {
  EMAIL_CLEANUP_BATCH_SIZE,
  TERMINAL_EMAIL_JOB_STATUSES,
  emailCleanupCutoff,
  shouldContinueEmailCleanup,
} from "../../domain/email/rules";
import type {
  EmailJobScheduler,
  EmailWebhookEventStore,
  TransactionalEmailJobStore,
} from "../../domain/email/store";

export type CleanupEmailDeps = {
  jobs: TransactionalEmailJobStore;
  events: EmailWebhookEventStore;
  scheduler: EmailJobScheduler;
  now?: () => number;
};

export async function cleanupOldEmailRecords(deps: CleanupEmailDeps): Promise<void> {
  const now = (deps.now ?? Date.now)();
  const cutoff = emailCleanupCutoff(now);

  let deletedJobCount = 0;
  for (const status of TERMINAL_EMAIL_JOB_STATUSES) {
    const jobs = await deps.jobs.listTerminalJobsUpdatedBefore(
      status,
      cutoff,
      EMAIL_CLEANUP_BATCH_SIZE,
    );
    for (const job of jobs) {
      await deps.jobs.deleteJob(job.id);
      deletedJobCount++;
    }
  }

  const events = await deps.events.listEventsProcessedBefore(cutoff, EMAIL_CLEANUP_BATCH_SIZE);
  for (const event of events) {
    await deps.events.deleteEvent(event.id);
  }

  if (shouldContinueEmailCleanup(deletedJobCount, events.length)) {
    await deps.scheduler.scheduleCleanup(0);
  }
}
