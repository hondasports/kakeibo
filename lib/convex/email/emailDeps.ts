import type { ActionCtx, MutationCtx } from "../../../convex/_generated/server";
import type { CleanupEmailDeps } from "../../usecase/email/cleanup";
import type { DeleteTestEmailRecordsDeps } from "../../usecase/email/deleteTestRecords";
import type { EnqueueJobDeps } from "../../usecase/email/enqueueJob";
import type { ProcessEmailJobDeps } from "../../usecase/email/processJob";
import type { ProcessResendEventDeps } from "../../usecase/email/processResendEvent";
import type { SuppressionDeps } from "../../usecase/email/suppressions";
import { createEmailJobStore } from "./convexEmailJobStore";
import { createEmailScheduler } from "./convexEmailScheduler";
import { createEmailSuppressionStore } from "./convexEmailSuppressionStore";
import { createEmailWebhookEventStore } from "./convexEmailWebhookEventStore";
import { createEmailSender } from "./emailSender";
import { createEmailJobActionRunner, createResendEventRunner } from "./emailRunner";

export function createEnqueueJobDeps(ctx: Pick<MutationCtx, "db" | "scheduler">): EnqueueJobDeps {
  return {
    jobs: createEmailJobStore(ctx),
    scheduler: createEmailScheduler(ctx),
  };
}

export function createProcessEmailJobDeps(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation" | "scheduler">,
): ProcessEmailJobDeps {
  return {
    runner: createEmailJobActionRunner(ctx),
    sender: createEmailSender(),
    scheduler: createEmailScheduler(ctx),
  };
}

export function createProcessResendEventDeps(
  ctx: Pick<MutationCtx, "db" | "runQuery" | "runMutation">,
): ProcessResendEventDeps {
  return {
    runner: createResendEventRunner(ctx),
    events: createEmailWebhookEventStore(ctx),
  };
}

export function createCleanupEmailDeps(
  ctx: Pick<MutationCtx, "db" | "scheduler">,
): CleanupEmailDeps {
  return {
    jobs: createEmailJobStore(ctx),
    events: createEmailWebhookEventStore(ctx),
    scheduler: createEmailScheduler(ctx),
  };
}

export function createSuppressionDeps(ctx: Pick<MutationCtx, "db">): SuppressionDeps {
  return {
    suppressions: createEmailSuppressionStore(ctx),
  };
}

export function createDeleteTestEmailRecordsDeps(
  ctx: Pick<MutationCtx, "db">,
): DeleteTestEmailRecordsDeps {
  return {
    jobs: createEmailJobStore(ctx),
    suppressions: createEmailSuppressionStore(ctx),
    events: createEmailWebhookEventStore(ctx),
  };
}
