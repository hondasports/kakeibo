/**
 * AiExpenseDraftItemRepository の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  AiExpenseDraftItemReadRepository,
  AiExpenseDraftItemRepository,
} from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import { draftItemDocToFields } from "./draftRecordMapping";

export function createAiExpenseDraftItemRepository(
  ctx: Pick<MutationCtx, "db">,
): AiExpenseDraftItemRepository {
  return {
    async listByDraftAsc(groupId, draftId, limit) {
      const query = ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("draftId", draftId as Id<"aiExpenseDrafts">),
        )
        .order("asc");
      const docs = limit === undefined ? await query.collect() : await query.take(limit);
      return docs.map(draftItemDocToFields);
    },
    async listAllByDraft(groupId, draftId) {
      const docs = await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("draftId", draftId as Id<"aiExpenseDrafts">),
        )
        .collect();
      return docs.map(draftItemDocToFields);
    },
    async insert(fields) {
      return await ctx.db.insert(
        "aiExpenseDraftItems",
        fields as Omit<Doc<"aiExpenseDraftItems">, "_id" | "_creationTime">,
      );
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"aiExpenseDraftItems">);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createAiExpenseDraftItemReadRepository(
  ctx: Pick<QueryCtx, "db">,
): AiExpenseDraftItemReadRepository {
  return {
    async listByDraftAsc(groupId, draftId, limit) {
      const query = ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("draftId", draftId as Id<"aiExpenseDrafts">),
        )
        .order("asc");
      const docs = limit === undefined ? await query.collect() : await query.take(limit);
      return docs.map(draftItemDocToFields);
    },
    async listAllByDraft(groupId, draftId) {
      const docs = await ctx.db
        .query("aiExpenseDraftItems")
        .withIndex("by_group_id_and_draft_id", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("draftId", draftId as Id<"aiExpenseDrafts">),
        )
        .collect();
      return docs.map(draftItemDocToFields);
    },
  };
}
