import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import {
  planExpenseEntryReconciliation,
  ReconcileExpenseEntriesDomainError,
} from "../../domain/aiExpenseDrafts/reconcileExpenseEntriesPlan";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import type { DraftRegistrationItem } from "../../domain/aiExpenseDrafts/registrationItems";
import { assertExpenseCategoryBelongsToGroup } from "../expenseEntries/expenseEntryValidation";

export {
  buildDraftRegistrationItems,
  resolveRegistrationMode,
} from "../../domain/aiExpenseDrafts/registrationItems";

type RegistrationItem = DraftRegistrationItem;

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

  let plan;
  try {
    plan = planExpenseEntryReconciliation({
      existing,
      items: args.items,
      draftId: args.draft._id,
      draftDate: args.draft.date!,
      groupId: args.groupId,
      userId: args.userId,
      memoUpdate: args.memoUpdate,
      now: args.now,
    });
  } catch (error) {
    if (error instanceof ReconcileExpenseEntriesDomainError) {
      throw new ConvexError(error.message);
    }
    throw error;
  }

  const resultIds: Id<"expenseEntries">[] = [];
  for (const op of plan.ops) {
    await assertExpenseCategoryBelongsToGroup(ctx, op.categoryId as Id<"categories">, args.groupId);
    if (op.kind === "patch") {
      const { memo, ...rest } = op.fields;
      await ctx.db.patch(op.entryId as Id<"expenseEntries">, {
        ...rest,
        categoryId: op.fields.categoryId as Id<"categories">,
        ...("memo" in op.fields ? { memo } : {}),
      });
      resultIds.push(op.entryId as Id<"expenseEntries">);
      continue;
    }
    const { memo, ...rest } = op.fields;
    resultIds.push(
      await ctx.db.insert("expenseEntries", {
        ...rest,
        groupId: op.fields.groupId as Id<"groups">,
        aiExpenseDraftId: op.fields.aiExpenseDraftId as Id<"aiExpenseDrafts">,
        categoryId: op.fields.categoryId as Id<"categories">,
        ...("memo" in op.fields ? { memo } : {}),
      }),
    );
  }

  for (const entryId of plan.deleteIds) {
    await ctx.db.delete(entryId as Id<"expenseEntries">);
  }
  return resultIds;
}

export type { AiExpenseRegistrationMode };
