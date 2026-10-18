import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import type { AiExpenseDraftFields } from "../../domain/aiExpenseDrafts/aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "../../domain/aiExpenseDrafts/aiExpenseDraftItem";
import { applyRecordPatch } from "../../domain/common/recordPatch";
import {
  buildReceiptUserOverride,
  resolveReceiptTaxCorrections,
  snapshotReceiptDraftValues as snapshotReceiptDraftValuesDomain,
  type ReceiptDraftValueSnapshot,
  type ReceiptUserOverrideSnapshot,
} from "../../domain/aiExpenseDrafts/receiptDataContract";
import { resetReceiptToAiInterpretation } from "../../usecase/aiExpenseDrafts/resetReceiptToAiInterpretation";
import { createAiExpenseDraftDeps } from "./draftUsecaseDeps";
import { draftFieldsToDoc, draftItemFieldsToDoc } from "./draftRecordMapping";

export function snapshotReceiptDraftValues(
  draft: Doc<"aiExpenseDrafts">,
  items: Doc<"aiExpenseDraftItems">[],
): ReceiptDraftValueSnapshot<Id<"categories">> {
  return snapshotReceiptDraftValuesDomain(draft, items);
}

export async function persistReceiptUserOverrideSnapshot(
  ctx: MutationCtx,
  args: {
    draftId: Id<"aiExpenseDrafts">;
    groupId: Id<"groups">;
    fields: string[];
    updatedAt?: number;
    /** 既に読み込んだ（または直前の永続化結果の）下書き・明細。渡せば DB 再取得を省略する。 */
    draft?: AiExpenseDraftFields;
    items?: AiExpenseDraftItemFields[];
  },
): Promise<Doc<"aiExpenseDrafts">> {
  const draft =
    args.draft !== undefined ? draftFieldsToDoc(args.draft) : await ctx.db.get(args.draftId);
  if (draft === null || draft.groupId !== args.groupId) {
    throw new Error("AI expense draft not found while saving user override");
  }
  const items =
    args.items !== undefined
      ? args.items.slice(0, 100).map(draftItemFieldsToDoc)
      : await ctx.db
          .query("aiExpenseDraftItems")
          .withIndex("by_group_id_and_draft_id", (q) =>
            q.eq("groupId", args.groupId).eq("draftId", args.draftId),
          )
          .order("asc")
          .take(100);
  const updatedAt = args.updatedAt ?? Date.now();
  const receiptUserOverride: ReceiptUserOverrideSnapshot<Id<"categories">> =
    buildReceiptUserOverride({
      existingFields: draft.receiptUserOverride?.fields,
      taxSummaryCorrections: resolveReceiptTaxCorrections(
        draft.receiptUserOverride,
        draft.receiptInterpretation?.values.taxSummaries,
      ),
      fields: args.fields,
      updatedAt,
      values: snapshotReceiptDraftValues(draft, items),
    });
  await ctx.db.patch(args.draftId, { receiptUserOverride, updatedAt });
  return applyRecordPatch(draft as unknown as Record<string, unknown>, {
    receiptUserOverride,
    updatedAt,
  }) as unknown as Doc<"aiExpenseDrafts">;
}

/** ハンドラ互換のグルー。実装は lib/usecase/aiExpenseDrafts/resetReceiptToAiInterpretation。 */
export async function resetReceiptToAiInterpretationHandler(
  ctx: MutationCtx,
  args: { draftId: Id<"aiExpenseDrafts"> },
  groupId: Id<"groups">,
) {
  const result = await resetReceiptToAiInterpretation(
    { groupId },
    createAiExpenseDraftDeps(ctx),
    args,
  );
  return {
    draft: draftFieldsToDoc(result.draft),
    items: result.items.map(draftItemFieldsToDoc),
  };
}
