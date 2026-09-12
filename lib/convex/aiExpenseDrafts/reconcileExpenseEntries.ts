import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import type { DraftRegistrationItem } from "../../domain/aiExpenseDrafts/registrationItems";
import { assertExpenseCategoryBelongsToGroup } from "../expenseEntries/expenseEntryValidation";

type RegistrationItem = Omit<DraftRegistrationItem, "categoryId"> & {
  categoryId: Id<"categories">;
};

export {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";

/**
 * 下書きに紐づく支出エントリを upsert/delete で同期する。
 * 既存エントリはカテゴリ一致を優先して再利用し、残りは削除する。
 */
export async function reconcileDraftExpenseEntries(
  ctx: Pick<MutationCtx, "db">,
  args: {
    draft: Doc<"aiExpenseDrafts">;
    groupId: Id<"groups">;
    userId: string;
    items: RegistrationItem[];
    memoUpdate?: { value?: string };
    now: number;
  },
): Promise<Id<"expenseEntries">[]> {
  const existing = await ctx.db
    .query("expenseEntries")
    .withIndex("by_group_id_and_ai_expense_draft_id", (q) =>
      q.eq("groupId", args.groupId).eq("aiExpenseDraftId", args.draft._id),
    )
    .take(101);
  if (existing.length > 100) {
    throw new ConvexError("Too many expense entries are linked to this draft");
  }

  const retainedIds = new Set<Id<"expenseEntries">>();
  const resultIds: Id<"expenseEntries">[] = [];
  for (const item of args.items) {
    await assertExpenseCategoryBelongsToGroup(ctx, item.categoryId, args.groupId);
    const reusable =
      existing.find(
        (entry) => entry.categoryId === item.categoryId && !retainedIds.has(entry._id),
      ) ?? existing.find((entry) => !retainedIds.has(entry._id));
    if (reusable) {
      retainedIds.add(reusable._id);
      await ctx.db.patch(reusable._id, {
        date: args.draft.date!,
        amount: item.amountYen,
        categoryId: item.categoryId,
        title: item.itemName,
        ...(args.memoUpdate === undefined ? {} : { memo: args.memoUpdate.value }),
        entryType: "expense",
        source: "ai_suggested",
        updatedAt: args.now,
      });
      resultIds.push(reusable._id);
      continue;
    }
    resultIds.push(
      await ctx.db.insert("expenseEntries", {
        groupId: args.groupId,
        createdByUserId: args.userId,
        aiExpenseDraftId: args.draft._id,
        date: args.draft.date!,
        amount: item.amountYen,
        categoryId: item.categoryId,
        title: item.itemName,
        ...(args.memoUpdate?.value === undefined ? {} : { memo: args.memoUpdate.value }),
        entryType: "expense",
        source: "ai_suggested",
        createdAt: args.now,
        updatedAt: args.now,
      }),
    );
  }

  for (const entry of existing) {
    if (!retainedIds.has(entry._id) && !resultIds.includes(entry._id)) {
      await ctx.db.delete(entry._id);
    }
  }
  return resultIds;
}

export type { AiExpenseRegistrationMode };
