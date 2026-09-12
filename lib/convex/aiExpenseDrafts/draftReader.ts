/**
 * AiExpenseDraftReader の Convex 実装。
 * expenseEntries 作成ユースケース向けの最小限の読み取りだけを提供する。
 */
import type { QueryCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { AiExpenseDraftReader } from "../../domain/aiExpenseDrafts/draftForEntryCreation";

export function createAiExpenseDraftReader(ctx: Pick<QueryCtx, "db">): AiExpenseDraftReader {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"aiExpenseDrafts">);
      if (doc === null) {
        return null;
      }
      return {
        id: doc._id,
        groupId: doc.groupId,
        status: doc.status,
        date: doc.date,
        categoryId: doc.categoryId,
      };
    },
  };
}
