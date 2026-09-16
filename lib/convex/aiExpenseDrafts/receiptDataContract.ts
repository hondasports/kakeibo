import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { MutationCtx } from "../../../convex/_generated/server";
import {
  buildReceiptUserOverride,
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
  },
): Promise<Doc<"aiExpenseDrafts">> {
  const draft = await ctx.db.get(args.draftId);
  if (draft === null || draft.groupId !== args.groupId) {
    throw new Error("AI expense draft not found while saving user override");
  }
  const items = await ctx.db
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
      fields: args.fields,
      updatedAt,
      values: snapshotReceiptDraftValues(draft, items),
    });
  await ctx.db.patch(args.draftId, { receiptUserOverride, updatedAt });
  const updated = await ctx.db.get(args.draftId);
  if (updated === null) {
    throw new Error("AI expense draft not found after saving user override");
  }
  return updated;
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
