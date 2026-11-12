import { isDiscountLine } from "../../domain/receipt/discountItems";
import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  requireGroupMembership,
  requireGroupMembershipForGroup,
  requireGroupMembershipForUserInGroup,
} from "../../../convex/groups/membership";
import { deleteDraftAndItems } from "./draftRepository";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import type { ReceiptDraftItemSnapshot } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { buildDraftListSummary } from "../../domain/aiExpenseDrafts/listSummary";
import { buildDraftReviewState } from "../../domain/aiExpenseDrafts/draftReviewState";
import {
  buildExtractedDraftFields,
  buildExtractedDraftItemFields,
  buildFailedDraftFields,
  DRAFT_CATEGORY_NOT_IN_GROUP_MESSAGE,
  DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE,
  validateDraftCategoryOwnership,
  type ExtractedDraftInput,
} from "../../domain/aiExpenseDrafts/createFromExtraction";

export type CreateFromExtractionArgs = ExtractedDraftInput<Id<"categories">> & {
  groupId: Id<"groups">;
};

export type CreateFailedDraftFromImageAnalysisArgs = {
  groupId: Id<"groups">;
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
  items: ReceiptDraftItemSnapshot<Id<"categories">>[],
  now: number,
): Promise<AiExpenseDraftItemFields[]> {
  const inserted: AiExpenseDraftItemFields[] = [];
  for (const item of items) {
    await assertCategoryBelongsToGroup(ctx, item.categoryId, groupId);
    const fields = buildExtractedDraftItemFields(groupId, draftId, item, now);
    const id = await ctx.db.insert("aiExpenseDraftItems", fields);
    inserted.push({ ...fields, id });
  }
  for (const [index, item] of items.entries()) {
    const targetIndex = item.discountTargetItemIndex;
    if (
      targetIndex === undefined ||
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= items.length ||
      !isDiscountLine(item.itemName, item.lineType) ||
      isDiscountLine(items[targetIndex].itemName, items[targetIndex].lineType)
    )
      continue;
    const targetId = inserted[targetIndex].id as Id<"aiExpenseDraftItems">;
    await ctx.db.patch(inserted[index].id as Id<"aiExpenseDraftItems">, {
      discountTargetItemId: targetId,
    });
    inserted[index].discountTargetItemId = targetId;
  }
  return inserted;
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

  const insertedItems = await insertDraftItems(ctx, actor.groupId, draftId, values.items, now);
  const { status, reviewReasons, listSummary } = buildDraftReviewState(
    { ...draft, id: draftId } as AiExpenseDraftFields,
    insertedItems,
    { reasons: draft.reviewReasons, preserveUserConfirmation: true },
  );
  await ctx.db.patch(draftId, { status, reviewReasons, listSummary, updatedAt: now });

  const created = await ctx.db.get(draftId);
  if (created === null) {
    throw new ConvexError(DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE);
  }
  return created;
}

export async function persistFailedDraft(
  ctx: Pick<MutationCtx, "db">,
  actor: ResolvedActor,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const now = Date.now();
  const fields = buildFailedDraftFields(actor, args, now);
  const draftId = await ctx.db.insert("aiExpenseDrafts", {
    ...fields,
    listSummary: buildDraftListSummary(fields, []),
  });

  const draft = await ctx.db.get(draftId);
  if (draft === null) {
    throw new ConvexError(DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE);
  }
  return draft;
}

export async function createFromExtractionHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionArgs,
) {
  const membership = await requireGroupMembershipForGroup(ctx, args.groupId);
  return persistExtractedDraft(
    ctx,
    { userId: membership.userId, groupId: membership.groupId },
    args,
  );
}

export async function createFromExtractionForUserHandler(
  ctx: MutationCtx,
  args: CreateFromExtractionForUserArgs,
) {
  const membership = await requireGroupMembershipForUserInGroup(ctx, args.userId, args.groupId);
  return persistExtractedDraft(ctx, { userId: args.userId, groupId: membership.groupId }, args);
}

export async function createFailedDraftFromImageAnalysisHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisArgs,
) {
  const membership = await requireGroupMembershipForGroup(ctx, args.groupId);
  return persistFailedDraft(ctx, { userId: membership.userId, groupId: membership.groupId }, args);
}

export async function createFailedDraftFromImageAnalysisForUserHandler(
  ctx: MutationCtx,
  args: CreateFailedDraftFromImageAnalysisForUserArgs,
) {
  const membership = await requireGroupMembershipForUserInGroup(ctx, args.userId, args.groupId);
  return persistFailedDraft(ctx, { userId: args.userId, groupId: membership.groupId }, args);
}

export async function deleteOrphanedDraftHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
) {
  const { groupId } = await requireGroupMembership(ctx);
  await deleteDraftAndItems(ctx, args.draftId, groupId);
}
