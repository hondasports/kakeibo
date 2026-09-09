import { reinterpretDraftTax } from "../../receiptTax/reinterpretDraftTax";
import { mapDraftItemToTaxFields } from "../../receiptTax/draftTaxMapping";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import { resolveReceiptShopNameFromDraft } from "../../domain/aiExpenseDrafts/shopName";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { assertExpenseCategoryBelongsToGroup } from "../expenseEntries/expenseEntryValidation";
import { aggregateDraftItemsByCategory } from "./reviewValidation";

type RegistrationItem = {
  itemName: string;
  amountYen: number;
  categoryId: Id<"categories">;
};

export function resolveRegistrationMode(draft: Pick<Doc<"aiExpenseDrafts">, "registrationMode">) {
  return draft.registrationMode ?? "detailed";
}

function assertUserConfirmedReceiptTotal(draft: Doc<"aiExpenseDrafts">) {
  const resolution = draft.receiptTotalResolution;
  const hasMatchingUserCandidate = resolution?.candidates.some(
    (candidate) => candidate.source === "user_confirmed" && candidate.amountYen === draft.amountYen,
  );
  if (
    resolution?.status !== "verified" ||
    resolution.protectedAmountYen !== draft.amountYen ||
    !hasMatchingUserCandidate
  ) {
    throw new ConvexError("Receipt total must be confirmed before total-only registration");
  }
}

export function buildDraftRegistrationItems(
  draft: Doc<"aiExpenseDrafts">,
  items: Doc<"aiExpenseDraftItems">[],
): RegistrationItem[] {
  const mode = resolveRegistrationMode(draft);
  if (mode === "totalOnly") {
    assertUserConfirmedReceiptTotal(draft);
    return [
      {
        itemName: resolveReceiptShopNameFromDraft(draft),
        amountYen: draft.amountYen!,
        categoryId: draft.categoryId!,
      },
    ];
  }
  if (draft.taxSummaries?.length || items.some((item) => item.taxRatePercent != null)) {
    const { itemFields, interpretation } = reinterpretDraftTax({
      amountYen: draft.amountYen!,
      items: items.map(mapDraftItemToTaxFields),
      taxSummaries: draft.taxSummaries ?? [],
      markerDefinitions: draft.markerDefinitions,
    });
    if (
      interpretation.taxSummaries.some((summary) => summary.status !== "verified") ||
      itemFields.some(
        (item, index) =>
          item.taxAllocationStatus !== "allocated" ||
          item.normalizedAmountYen !== (items[index].normalizedAmountYen ?? items[index].amountYen),
      ) ||
      itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0) !== draft.amountYen
    ) {
      throw new ConvexError(
        "税額または税込登録額が未確定です。税内訳と明細を確認して下書きを保存してください。",
      );
    }
  }
  return aggregateDraftItemsByCategory(draft, items);
}

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
