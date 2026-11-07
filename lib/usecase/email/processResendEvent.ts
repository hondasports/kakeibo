import { ConvexError } from "convex/values";
import { normalizeEmail, type EmailWebhookEventType } from "../../email/model";
import { extractResendEventFields, type ResendWebhookPayloadData } from "../../domain/email/rules";
import type { ResendEventRunner } from "../../domain/email/runner";
import type { EmailWebhookEventStore } from "../../domain/email/store";
import type { EmailWebhookEventRecord } from "../../domain/email/records";
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
  events: Pick<
    EmailWebhookEventStore,
    "insertEvent" | "markEventApplied" | "listEventsByProviderMessageId"
  >;
  now?: () => number;
};

function parsePayload(payloadJson: string): ResendWebhookPayloadData {
  let data: unknown;
  try {
    data = JSON.parse(payloadJson);
  } catch {
    throw new ConvexError("Invalid webhook payload JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new ConvexError("Invalid webhook payload JSON");
  }

  return data as ResendWebhookPayloadData;
}

export async function processResendEvent(
  deps: ProcessResendEventDeps,
  args: ProcessResendEventArgs,
): Promise<void> {
  const typedData = parsePayload(args.payloadJson);
  const { providerMessageId, recipientEmail } = extractResendEventFields(typedData);
  const eventCreatedAt = args.eventCreatedAt;

  const duplicate = await deps.runner.findEventBySvixId(args.svixId);
  if (duplicate) {
    return;
  }

  if (eventCreatedAt === undefined || !Number.isFinite(eventCreatedAt)) {
    throw new ConvexError("Invalid webhook event timestamp");
  }

  const now = (deps.now ?? Date.now)();
  const event = {
    svixId: args.svixId,
    provider: args.provider,
    eventType: args.eventType,
    providerMessageId,
    recipientEmail,
    payloadJson: args.payloadJson,
    eventCreatedAt,
    processedAt: args.processedAt,
    createdAt: now,
  };
  const id = await deps.events.insertEvent(event);
  await applyResendEvent(deps, { ...event, id }, now);
}

export async function reconcileResendEvents(
  deps: ProcessResendEventDeps,
  providerMessageId: string,
): Promise<void> {
  const events = await deps.events.listEventsByProviderMessageId(providerMessageId);
  const now = (deps.now ?? Date.now)();
  for (const event of events) {
    if (event.appliedAt === undefined) await applyResendEvent(deps, event, now);
  }
}

async function applyResendEvent(
  deps: ProcessResendEventDeps,
  event: EmailWebhookEventRecord,
  now: number,
): Promise<void> {
  const { providerMessageId, recipientEmail, eventCreatedAt } = event;
  if (!providerMessageId || eventCreatedAt === undefined || !Number.isFinite(eventCreatedAt)) {
    return;
  }

  const job = await deps.runner.findJobByProviderMessageId(providerMessageId);
  if (!job) {
    return;
  }

  const resolved = resolveStatusAndSuppression(event.eventType, parsePayload(event.payloadJson));
  if (!resolved) {
    await deps.events.markEventApplied(event.id, now);
    return;
  }
  const { statusUpdate, suppressionReason, suppressionSource } = resolved;
  const watermark = job.lastVerifiedProviderEventAt;
  const isLegacyState = watermark === undefined && job.lastProviderEventAt !== undefined;
  if (isLegacyState) {
    await deps.runner.refreshLegacyJobRetention(job.id, now);
  }
  if (
    !isLegacyState &&
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
  await deps.events.markEventApplied(event.id, now);
}
