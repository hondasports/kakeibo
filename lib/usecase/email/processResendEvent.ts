import { ConvexError } from "convex/values";
import {
  normalizeEmail,
  type EmailSuppressionReason,
  type EmailWebhookEventType,
} from "../../email/model";
import { extractResendEventFields, type ResendWebhookPayloadData } from "../../domain/email/rules";
import type { ResendEventRunner } from "../../domain/email/runner";
import type { EmailWebhookEventStore } from "../../domain/email/store";
import { resolveStatusAndSuppression, shouldApplyWebhookStatus } from "../../domain/email/webhook";

export type ProcessResendEventArgs = {
  svixId: string;
  provider: string;
  eventType: EmailWebhookEventType;
  payloadJson: string;
  eventCreatedAt?: number;
  processedAt: number;
};

export type ProcessResendEventDeps = {
  runner: ResendEventRunner;
  events: Pick<EmailWebhookEventStore, "insertEvent">;
  now?: () => number;
};

export async function processResendEvent(
  deps: ProcessResendEventDeps,
  args: ProcessResendEventArgs,
): Promise<void> {
  let data: unknown;
  try {
    data = JSON.parse(args.payloadJson);
  } catch {
    throw new ConvexError("Invalid webhook payload JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConvexError("Invalid webhook payload JSON");
  }

  const typedData = data as ResendWebhookPayloadData;
  const { providerMessageId, recipientEmail } = extractResendEventFields(typedData);
  const eventCreatedAt = args.eventCreatedAt;

  const duplicate = await deps.runner.findEventBySvixId(args.svixId);
  if (duplicate) {
    return;
  }

  if (eventCreatedAt === undefined || !Number.isFinite(eventCreatedAt)) {
    throw new ConvexError("Invalid webhook event timestamp");
  }

  let statusUpdate:
    | NonNullable<ReturnType<typeof resolveStatusAndSuppression>>["statusUpdate"]
    | undefined;
  let suppressionReason: EmailSuppressionReason | undefined;
  let suppressionSource: string | undefined;
  const resolved = resolveStatusAndSuppression(args.eventType, typedData);
  if (resolved) {
    statusUpdate = resolved.statusUpdate;
    suppressionReason = resolved.suppressionReason;
    suppressionSource = resolved.suppressionSource;
  }

  const now = (deps.now ?? Date.now)();

  await deps.events.insertEvent({
    svixId: args.svixId,
    provider: args.provider,
    eventType: args.eventType,
    providerMessageId,
    recipientEmail,
    payloadJson: args.payloadJson,
    eventCreatedAt,
    processedAt: args.processedAt,
    createdAt: now,
  });

  if (!providerMessageId || !statusUpdate) {
    return;
  }

  const job = await deps.runner.findJobByProviderMessageId(providerMessageId);
  if (!job) {
    return;
  }

  const watermark = job.lastVerifiedProviderEventAt;
  const isLegacyState = watermark === undefined && job.lastProviderEventAt !== undefined;
  if (isLegacyState) {
    await deps.runner.refreshLegacyJobRetention(job.id, now);
  }
  if (
    !isLegacyState &&
    eventCreatedAt !== undefined &&
    Number.isFinite(eventCreatedAt) &&
    shouldApplyWebhookStatus(job.status, statusUpdate, watermark, eventCreatedAt)
  ) {
    await deps.runner.updateJobStatusFromWebhook({
      jobId: job.id,
      status: statusUpdate,
      lastProviderEventAt: eventCreatedAt,
      lastVerifiedProviderEventAt: eventCreatedAt,
      updatedAt: now,
    });
  }

  if (suppressionReason && recipientEmail) {
    await deps.runner.upsertSuppression({
      email: recipientEmail,
      normalizedEmail: normalizeEmail(recipientEmail),
      reason: suppressionReason,
      source: suppressionSource,
      providerMessageId,
      createdAt: now,
    });
  }
}
