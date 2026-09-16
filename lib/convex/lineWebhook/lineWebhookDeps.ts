/**
 * lineWebhook ユースケースの composition root。
 * Query/Mutation/Action の ctx 種別ごとに deps を組み立てる。
 */
import type { ActionCtx, MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { createGroupReadRepository } from "../groups/convexGroupRepository";
import { createUserSettingsRepository } from "../users/userSettingsRepository";
import { createLineAccountLinkReader } from "./convexLineAccountLinkReader";
import { createLineActiveGroupResolver } from "./convexLineActiveGroupResolver";
import { createLineImageJobReader, createLineImageJobStore } from "./convexLineImageJobStore";
import { createLineSummaryDataReader } from "./convexLineSummaryDataReader";
import {
  createLineWebhookEventReader,
  createLineWebhookEventStore,
} from "./convexLineWebhookEventStore";
import { createLineWebhookScheduler } from "./convexLineWebhookScheduler";
import { createLineWebhookUserReader } from "./convexLineWebhookUserReader";
import {
  createLineActionScheduler,
  createLineImageContextReader,
  createLineImageDraftRunner,
  createLineImageJobRunner,
  createLineReplySender,
  createLineSummaryRunner,
} from "./lineActionRunners";

export function createLineWebhookMutationDeps(ctx: MutationCtx) {
  return {
    webhookEvents: createLineWebhookEventStore(ctx),
    imageJobs: createLineImageJobStore(ctx),
    accountLinks: createLineAccountLinkReader(ctx),
    scheduler: createLineWebhookScheduler(ctx),
  };
}

export function createLineWebhookQueryDeps(ctx: QueryCtx) {
  return {
    imageJobs: createLineImageJobReader(ctx),
    accountLinks: createLineAccountLinkReader(ctx),
    users: createLineWebhookUserReader(ctx),
    activeGroup: createLineActiveGroupResolver(ctx),
    groups: createGroupReadRepository(ctx),
    userSettings: createUserSettingsRepository(ctx),
    summaryData: createLineSummaryDataReader(ctx),
    webhookEvents: createLineWebhookEventReader(ctx),
  };
}

export function createLineWebhookActionDeps(ctx: ActionCtx) {
  return {
    imageJobs: createLineImageJobRunner(ctx),
    imageContext: createLineImageContextReader(ctx),
    drafts: createLineImageDraftRunner(ctx),
    replySender: createLineReplySender(),
    summary: createLineSummaryRunner(ctx),
    actionScheduler: createLineActionScheduler(ctx),
  };
}
