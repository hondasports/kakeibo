import { ConvexError } from "convex/values";
import { normalizeEmail, type TransactionalEmailType } from "../../email/model";
import { getTemplateSubject, validatePayloadForTemplate } from "../../email/templateDefinitions";
import { buildNewEmailJobFields } from "../../domain/email/rules";
import type { EmailJobScheduler, TransactionalEmailJobStore } from "../../domain/email/store";

export type EnqueueTransactionalEmailJobArgs = {
  templateType: TransactionalEmailType;
  payloadJson: string;
  recipientEmail: string;
  businessDedupeKey?: string;
};

export type EnqueueJobDeps = {
  jobs: TransactionalEmailJobStore;
  scheduler: EmailJobScheduler;
  now?: () => number;
};

export async function enqueueTransactionalEmailJob(
  deps: EnqueueJobDeps,
  args: EnqueueTransactionalEmailJobArgs,
): Promise<string> {
  let payload: unknown;
  try {
    payload = JSON.parse(args.payloadJson);
  } catch {
    throw new ConvexError("Invalid payload JSON");
  }

  const validation = validatePayloadForTemplate(args.templateType, payload);
  if (!validation.success) {
    throw new ConvexError("Invalid transactional email payload");
  }

  const subject = getTemplateSubject(args.templateType);
  const normalized = normalizeEmail(args.recipientEmail);
  const now = (deps.now ?? Date.now)();

  if (args.businessDedupeKey) {
    const existing = await deps.jobs.findJobByBusinessDedupeKey(args.businessDedupeKey);
    if (existing) return existing.id;
  }

  const jobId = await deps.jobs.insertJob(
    buildNewEmailJobFields({
      templateType: args.templateType,
      payloadJson: args.payloadJson,
      recipientEmail: args.recipientEmail,
      normalizedRecipientEmail: normalized,
      subject: subject ?? "",
      businessDedupeKey: args.businessDedupeKey,
      now,
    }),
  );

  await deps.scheduler.scheduleProcessJob(0, jobId);

  return jobId;
}
