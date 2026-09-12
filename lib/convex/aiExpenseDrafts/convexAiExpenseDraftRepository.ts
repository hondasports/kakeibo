/**
 * AiExpenseDraftRepository の Convex 実装。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { AiExpenseDraftStatus } from "../../domain/aiExpenseDrafts/constants";
import type {
  AiExpenseDraftReadRepository,
  AiExpenseDraftRepository,
} from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import { draftDocToFields } from "./draftRecordMapping";

export function createAiExpenseDraftRepository(
  ctx: Pick<MutationCtx, "db">,
): AiExpenseDraftRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"aiExpenseDrafts">);
      return doc === null ? null : draftDocToFields(doc);
    },
    async patch(id, patch) {
      await ctx.db.patch(id as Id<"aiExpenseDrafts">, patch as Partial<Doc<"aiExpenseDrafts">>);
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"aiExpenseDrafts">);
    },
    async listByGroupAndStatus(groupId, status, limit) {
      const docs = await ctx.db
        .query("aiExpenseDrafts")
        .withIndex("by_group_id_and_status_and_created_at", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("status", status as AiExpenseDraftStatus),
        )
        .order("desc")
        .take(limit);
      return docs.map(draftDocToFields);
    },
  };
}

/** 読み取り専用コンテキスト（query）向けの Read ポート実装。 */
export function createAiExpenseDraftReadRepository(
  ctx: Pick<QueryCtx, "db">,
): AiExpenseDraftReadRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"aiExpenseDrafts">);
      return doc === null ? null : draftDocToFields(doc);
    },
    async listByGroupAndStatus(groupId, status, limit) {
      const docs = await ctx.db
        .query("aiExpenseDrafts")
        .withIndex("by_group_id_and_status_and_created_at", (q) =>
          q.eq("groupId", groupId as Id<"groups">).eq("status", status as AiExpenseDraftStatus),
        )
        .order("desc")
        .take(limit);
      return docs.map(draftDocToFields);
    },
  };
}
