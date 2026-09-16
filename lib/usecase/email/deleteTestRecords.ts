import type {
  EmailSuppressionStore,
  EmailWebhookEventStore,
  TransactionalEmailJobStore,
} from "../../domain/email/store";

export type DeleteTestEmailRecordsDeps = {
  jobs: TransactionalEmailJobStore;
  suppressions: EmailSuppressionStore;
  events: EmailWebhookEventStore;
};

export type DeleteTestEmailRecordsResult = {
  deletedJobs: number;
  deletedSuppressions: number;
  deletedWebhookEvents: number;
};

export async function deleteTestEmailRecords(
  deps: DeleteTestEmailRecordsDeps,
  { normalizedEmail }: { normalizedEmail: string },
): Promise<DeleteTestEmailRecordsResult> {
  const jobs = await deps.jobs.listJobsByNormalizedRecipient(normalizedEmail);
  const providerMessageIds = new Set<string>();
  for (const job of jobs) {
    await deps.jobs.deleteJob(job.id);
    if (job.providerMessageId) {
      providerMessageIds.add(job.providerMessageId);
    }
  }

  const suppressions = await deps.suppressions.listByNormalizedEmail(normalizedEmail);
  for (const suppression of suppressions) {
    await deps.suppressions.deleteSuppression(suppression.id);
  }

  let deletedWebhookEvents = 0;
  for (const providerMessageId of providerMessageIds) {
    const events = await deps.events.listEventsByProviderMessageId(providerMessageId);
    for (const event of events) {
      await deps.events.deleteEvent(event.id);
      deletedWebhookEvents++;
    }
  }

  return {
    deletedJobs: jobs.length,
    deletedSuppressions: suppressions.length,
    deletedWebhookEvents,
  };
}
