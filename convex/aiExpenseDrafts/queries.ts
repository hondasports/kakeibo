import { v } from "convex/values";
import { query } from "../_generated/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { aiExpenseDraftStatusValidator } from "./model";
import { requireGroupMembership } from "../groups/membership";
import { listAiExpenseDraftsByStatus } from "../../lib/usecase/aiExpenseDrafts/listDraftsByStatus";
import { getAiExpenseDraftWithItems } from "../../lib/usecase/aiExpenseDrafts/getDraftWithItems";
import { createAiExpenseDraftQueryDeps } from "../../lib/convex/aiExpenseDrafts/draftUsecaseDeps";
import {
  draftFieldsToDoc,
  draftItemFieldsToDoc,
} from "../../lib/convex/aiExpenseDrafts/draftRecordMapping";
import type { AiExpenseDraftStatus } from "../../lib/domain/aiExpenseDrafts/constants";

type ListByStatusArgs = {
  status: AiExpenseDraftStatus;
};

type GetWithItemsArgs = {
  draftId: Id<"aiExpenseDrafts">;
};

export async function listByStatusHandler(ctx: QueryCtx, args: ListByStatusArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  const entries = await listAiExpenseDraftsByStatus(
    { groupId },
    createAiExpenseDraftQueryDeps(ctx),
    args,
  );
  return entries.map(({ id, creationTime, ...entry }) => ({
    ...entry,
    _id: id,
    _creationTime: creationTime,
  }));
}

export async function getWithItemsHandler(ctx: QueryCtx, args: GetWithItemsArgs) {
  const { groupId } = await requireGroupMembership(ctx);
  const result = await getAiExpenseDraftWithItems(
    { groupId },
    createAiExpenseDraftQueryDeps(ctx),
    args,
  );
  if (result === null) {
    return null;
  }
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}

export const listByStatus = query({
  args: {
    status: aiExpenseDraftStatusValidator,
  },
  handler: listByStatusHandler,
});

export const getWithItems = query({
  args: {
    draftId: v.id("aiExpenseDrafts"),
  },
  handler: getWithItemsHandler,
});
