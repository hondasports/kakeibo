import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import {
  createLineWebhookMutationDeps,
  createLineWebhookQueryDeps,
} from "../../lib/convex/lineWebhook/lineWebhookDeps";
import { claimEvents as claimEventsUseCase } from "../../lib/usecase/lineWebhook/claimEvents";
import {
  markImageJobDrafted as markImageJobDraftedUseCase,
  markImageJobFailed as markImageJobFailedUseCase,
  markImageJobSkipped as markImageJobSkippedUseCase,
} from "../../lib/usecase/lineWebhook/imageJobTransitions";
import { loadImageProcessingContext as loadImageProcessingContextUseCase } from "../../lib/usecase/lineWebhook/loadImageProcessingContext";
import {
  lineImageJobStatusValidator,
  lineImageSkipReasonValidator,
  lineWebhookEventInputValidator,
} from "./model";

export const claimEvents = internalMutation({
  args: {
    events: v.array(lineWebhookEventInputValidator),
  },
  returns: v.object({
    claimedCount: v.number(),
    duplicateCount: v.number(),
    scheduledGuideCount: v.number(),
    scheduledSummaryCount: v.number(),
    scheduledImageCount: v.number(),
  }),
  handler: async (ctx, args) => {
    return await claimEventsUseCase(createLineWebhookMutationDeps(ctx), args.events);
  },
});

const imageJobValidator = v.object({
  webhookEventId: v.string(),
  userId: v.string(),
  messageId: v.string(),
  status: lineImageJobStatusValidator,
  skipReason: v.optional(lineImageSkipReasonValidator),
  draftId: v.optional(v.id("aiExpenseDrafts")),
});

export const getImageJob = internalQuery({
  args: { webhookEventId: v.string() },
  returns: v.union(imageJobValidator, v.null()),
  handler: async (ctx, args) => {
    const job = await createLineWebhookQueryDeps(ctx).imageJobs.findByWebhookEventId(
      args.webhookEventId,
    );
    if (job === null) return null;
    return {
      webhookEventId: job.webhookEventId,
      userId: job.userId,
      messageId: job.messageId,
      status: job.status,
      ...(job.skipReason === undefined ? {} : { skipReason: job.skipReason }),
      ...(job.draftId === undefined ? {} : { draftId: job.draftId as Id<"aiExpenseDrafts"> }),
    };
  },
});

const categoryHintValidator = v.object({
  _id: v.id("categories"),
  name: v.string(),
  description: v.optional(v.string()),
});

export const loadImageProcessingContext = internalQuery({
  args: { userId: v.string() },
  returns: v.object({
    hasUniqueActiveLink: v.boolean(),
    hasConsent: v.boolean(),
    groupStatus: v.union(v.literal("resolved"), v.literal("no_group"), v.literal("unresolved")),
    groupId: v.optional(v.id("groups")),
    categories: v.array(categoryHintValidator),
  }),
  handler: async (ctx, args) => {
    return await loadImageProcessingContextHandler(ctx, args.userId);
  },
});

export async function loadImageProcessingContextHandler(ctx: QueryCtx, userId: string) {
  const context = await loadImageProcessingContextUseCase(createLineWebhookQueryDeps(ctx), userId);
  return {
    hasUniqueActiveLink: context.hasUniqueActiveLink,
    hasConsent: context.hasConsent,
    groupStatus: context.groupStatus,
    ...(context.groupId === undefined ? {} : { groupId: context.groupId as Id<"groups"> }),
    categories: context.categories.map((category) => ({
      _id: category.id as Id<"categories">,
      name: category.name,
      ...(category.description === undefined ? {} : { description: category.description }),
    })),
  };
}

export const markImageJobSkipped = internalMutation({
  args: {
    webhookEventId: v.string(),
    skipReason: lineImageSkipReasonValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markImageJobSkippedUseCase(
      createLineWebhookMutationDeps(ctx),
      args.webhookEventId,
      args.skipReason,
    );
    return null;
  },
});

export const markImageJobDrafted = internalMutation({
  args: {
    webhookEventId: v.string(),
    draftId: v.id("aiExpenseDrafts"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markImageJobDraftedUseCase(
      createLineWebhookMutationDeps(ctx),
      args.webhookEventId,
      args.draftId,
    );
    return null;
  },
});

export const markImageJobFailed = internalMutation({
  args: {
    webhookEventId: v.string(),
    draftId: v.optional(v.id("aiExpenseDrafts")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markImageJobFailedUseCase(
      createLineWebhookMutationDeps(ctx),
      args.webhookEventId,
      args.draftId,
    );
    return null;
  },
});
