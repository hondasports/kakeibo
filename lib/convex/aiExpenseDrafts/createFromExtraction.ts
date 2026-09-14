import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  requireGroupMembership,
  resolveActiveGroupForUserId,
} from "../../../convex/groups/membership";
import { deleteDraftAndItems } from "./draftRepository";
import {
  ACTIVE_GROUP_REQUIRED_MESSAGE,
  buildExtractedDraftFields,
  buildExtractedDraftItemFields,
  buildFailedDraftFields,
  DRAFT_CATEGORY_NOT_IN_GROUP_MESSAGE,
  DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE,
  validateDraftCategoryOwnership,
  type ExtractedDraftInput,
  type ExtractedDraftItemInput,
} from "../../domain/aiExpenseDrafts/createFromExtraction";

export type CreateFromExtractionArgs = ExtractedDraftInput<Id<"categories">>;

export type CreateFailedDraftFromImageAnalysisArgs = {
  warning: string;
  imageFileName?: string;
};

export type CreateFromExtractionForUserArgs = CreateFromExtractionArgs & {
  userId: string;
};

export type CreateFailedDraftFromImageAnalysisForUserArgs =
  CreateFailedDraftFromImageAnalysisArgs & {
    userId: string;
  };

type ResolvedActor = {
  userId: string;
  groupId: Id<"groups">;
};

async function assertCategoryBelongsToGroup(
  ctx: Pick<MutationCtx, "db">,
  categoryId: Id<"categories"> | undefined,
  groupId: Id<"groups">,
) {
  const category = categoryId === undefined ? null : await ctx.db.get(categoryId);
  const result = validateDraftCategoryOwnership(categoryId, category, groupId);
  if (!result.success) {
    throw new ConvexError(DRAFT_CATEGORY_NOT_IN_GROUP_MESSAGE);
  }
}

async function insertDraftItems(
  ctx: Pick<MutationCtx, "db">,
  groupId: Id<"groups">,
  draftId: Id<"aiExpenseDrafts">,
  items: ExtractedDraftItemInput<Id<"categories">>[],
  now: number,
) {
  for (const item of items) {
    await assertCategoryBelongsToGroup(ctx, item.categoryId, groupId);
    await ctx.db.insert(
      "aiExpenseDraftItems",
      buildExtractedDraftItemFields(groupId, draftId, item, now),
    );
  }
}

async function persistExtractedDraft(
  ctx: MutationCtx,
  actor: ResolvedActor,
  args: CreateFromExtractionArgs,
) {
  await assertCategoryBelongsToGroup(ctx, args.categoryId, actor.groupId);

  const now = Date.now();
  const { values, draft } = buildExtractedDraftFields(actor, args, now);
  await assertCategoryBelongsToGroup(ctx, values.categoryId, actor.groupId);
  const draftId = await ctx.db.insert("aiExpenseDrafts", draft);

  await insertDraftItems(ctx, actor.groupId, draftId, values.items, now);

  const created = await ctx.db.get(draftId);
  if (created === null) {
    throw new ConvexError(DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE);
  }
  return created;
}

async function persistFailedDraft(
  ctx: MutationCtx,
  actor: ResolvedActor,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const now = Date.now();
  const draftId = await ctx.db.insert("aiExpenseDrafts", buildFailedDraftFields(actor, args, now));

  const draft = await ctx.db.get(draftId);
  if (draft === null) {
    throw new ConvexError(DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE);
  }
  return draft;
}

async function requireResolvedActorForUser(
  ctx: MutationCtx,
  userId: string,
): Promise<ResolvedActor> {
  const resolved = await resolveActiveGroupForUserId(ctx, userId);
  if (resolved.status !== "resolved") {
    throw new ConvexError(ACTIVE_GROUP_REQUIRED_MESSAGE);
  }
  return { userId, groupId: resolved.membership.groupId };
}

export async function createFromExtractionHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return persistExtractedDraft(ctx, { userId, groupId }, args);
}

export async function createFromExtractionForUserHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionForUserArgs,
) {
  const actor = await requireResolvedActorForUser(ctx, args.userId);
  return persistExtractedDraft(ctx, actor, args);
}

export async function createFailedDraftFromImageAnalysisHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return persistFailedDraft(ctx, { userId, groupId }, args);
}

export async function createFailedDraftFromImageAnalysisForUserHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisForUserArgs,
) {
  const actor = await requireResolvedActorForUser(ctx, args.userId);
  return persistFailedDraft(ctx, actor, args);
}

export async function deleteOrphanedDraftHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  await deleteDraftAndItems(ctx, args.draftId, groupId);
}
