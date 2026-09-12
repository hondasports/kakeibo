import { ConvexError } from "convex/values";
import { AiExpenseDraft } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { DraftReviewItemInput } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { buildDerivedRegistration } from "../../domain/aiExpenseDrafts/registration";
import { buildDraftRegistrationItems } from "../../domain/aiExpenseDrafts/registrationItems";
import type { AiExpenseRegistrationMode } from "../../domain/aiExpenseDrafts/receiptDataContract";
import { validatePositiveCategoryTotals } from "../../domain/aiExpenseDrafts/reviewItems";
import {
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "../../domain/expenseEntries/expenseEntryItem";
import { resolveReceiptTotal } from "../../domain/receipt/tax/resolveReceiptTotal";
import { isValidIsoDateString } from "../../domain/week/weekDates";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";
import type { AiExpenseDraftDeps } from "./deps";
import { assertActiveCategoryForDraft } from "./assertActiveCategoryForDraft";

const LIST_LIMIT = 100;

export type UpdateRegisteredDraftUsecaseArgs = {
  draftId: string;
  date: string;
  amountYen: number;
  categoryId: string;
  shopName: string;
  memo?: string;
  registrationMode: AiExpenseRegistrationMode;
  items?: DraftReviewItemInput[];
};

/** registered 済み下書きを履歴から更新し、紐づく支出エントリへリコンサイルする。 */
export async function updateRegisteredAiExpenseDraft(
  ctx: UsecaseGroupContext,
  deps: Pick<
    AiExpenseDraftDeps,
    | "drafts"
    | "draftItems"
    | "categories"
    | "overrideSnapshots"
    | "itemReplace"
    | "expenseEntryReconcile"
  >,
  args: UpdateRegisteredDraftUsecaseArgs,
): Promise<{ draftId: string; expenseEntryIds: string[] }> {
  const fields = await deps.drafts.findById(args.draftId);
  if (fields === null) {
    throw new ConvexError("AI expense draft not found");
  }
  const draft = AiExpenseDraft.fromPersisted(fields);
  if (!draft.belongsToGroup(ctx.groupId)) {
    throw new ConvexError("AI expense draft does not belong to the current group");
  }
  try {
    draft.assertEditableFromHistory();
  } catch (err) {
    throw toConvexError(err);
  }
  if (!isValidIsoDateString(args.date)) {
    throw new ConvexError("Date must be valid");
  }
  if (!validateExpenseAmount(args.amountYen).success) {
    throw new ConvexError("Amount must be a positive integer");
  }
  const title = validateExpenseTitle(args.shopName);
  if (!title.success) {
    throw new ConvexError("Shop name is required");
  }
  const memo = validateExpenseMemo(args.memo);
  if (!memo.success) {
    throw new ConvexError("Memo must be 500 characters or less");
  }
  await assertActiveCategoryForDraft(deps.categories, args.categoryId, ctx.groupId);

  const now = Date.now();
  if (args.registrationMode === "detailed" && args.items !== undefined) {
    if (!validatePositiveCategoryTotals(args.items)) {
      throw new ConvexError("Draft category total must be greater than zero");
    }
    await deps.itemReplace.replaceForReview(args.draftId, ctx.groupId, args.items, now);
  }
  await deps.drafts.patch(args.draftId, {
    date: args.date,
    amountYen: args.amountYen,
    categoryId: args.categoryId,
    shopName: title.title,
    registrationMode: args.registrationMode,
    receiptTotalResolution: resolveReceiptTotal({
      amountYen: args.amountYen,
      source: "user_confirmed",
      confidence: 1,
      supportingCandidates: fields.receiptTotalResolution?.candidates.filter(
        (candidate) => candidate.source !== "user_confirmed",
      ),
      taxSummaries: fields.taxSummaries ?? [],
    }),
    updatedAt: now,
  });
  const updated = await deps.overrideSnapshots.persist({
    draftId: args.draftId,
    groupId: ctx.groupId,
    fields: [
      "date",
      "amountYen",
      "categoryId",
      "shopName",
      "registrationMode",
      "receiptTotalResolution",
      ...(args.items === undefined ? [] : ["items"]),
    ],
    updatedAt: now,
  });
  const items = await deps.draftItems.listByDraftAsc(ctx.groupId, args.draftId, LIST_LIMIT);
  let registrationItems;
  try {
    registrationItems = buildDraftRegistrationItems(updated, items);
  } catch (err) {
    throw toConvexError(err);
  }
  const expenseEntryIds = await deps.expenseEntryReconcile.reconcile({
    draft: updated,
    groupId: ctx.groupId,
    userId: ctx.userId,
    items: registrationItems,
    ...(args.memo === undefined ? {} : { memoUpdate: { value: memo.memo } }),
    now,
  });
  await deps.drafts.patch(args.draftId, {
    status: "registered",
    derivedRegistration: buildDerivedRegistration({
      destination: "expense_entries",
      registrationMode: args.registrationMode,
      amountYen: args.amountYen,
      date: args.date,
      categoryIds: [...new Set(registrationItems.map((item) => item.categoryId))],
      registeredAt: fields.derivedRegistration?.registeredAt ?? now,
    }),
    updatedAt: now,
  });
  return { draftId: args.draftId, expenseEntryIds };
}
