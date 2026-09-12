/**
 * ドメインのワークフローサービス・ポートの Convex 実装。
 * 既存の永続化オーケストレーション関数へ ctx を束縛したアダプタ。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DraftExpenseEntryReconcileService,
  DraftItemReplaceService,
  DraftOverrideSnapshotService,
  DraftReceiptInsertService,
  DraftTaxInterpretationService,
} from "../../domain/aiExpenseDrafts/draftWorkflowServices";
import type { UpdateForReviewItem } from "./reviewValidation";
import { persistDraftTaxInterpretation } from "./persistTaxInterpretation";
import { persistReceiptUserOverrideSnapshot } from "./receiptDataContract";
import { replaceDraftItemsForReview } from "./reviewValidation";
import { reconcileDraftExpenseEntries } from "./reconcileExpenseEntries";
import { insertReceiptForGroup } from "../receipts/insert";
import { draftDocToFields, draftFieldsToDoc, draftItemDocToFields } from "./draftRecordMapping";

export function createDraftTaxInterpretationService(
  ctx: MutationCtx,
): DraftTaxInterpretationService {
  return {
    async persistInterpretation(request) {
      const result = await persistDraftTaxInterpretation(ctx, {
        draftId: request.draftId as Id<"aiExpenseDrafts">,
        groupId: request.groupId as Id<"groups">,
        preservedNonTaxReasons: request.preservedNonTaxReasons,
        override: request.override,
        bulkUnresolvedOverride: request.bulkUnresolvedOverride,
        summaryOverride: request.summaryOverride,
        receiptTotalSource: request.receiptTotalSource,
        decisionOverride: request.decisionOverride,
      });
      return {
        draft: draftDocToFields(result.draft),
        items: result.items.map(draftItemDocToFields),
      };
    },
  };
}

export function createDraftOverrideSnapshotService(ctx: MutationCtx): DraftOverrideSnapshotService {
  return {
    async persist(args) {
      const doc = await persistReceiptUserOverrideSnapshot(ctx, {
        draftId: args.draftId as Id<"aiExpenseDrafts">,
        groupId: args.groupId as Id<"groups">,
        fields: args.fields,
        updatedAt: args.updatedAt,
      });
      return draftDocToFields(doc);
    },
  };
}

export function createDraftItemReplaceService(ctx: MutationCtx): DraftItemReplaceService {
  return {
    async replaceForReview(draftId, groupId, items, now) {
      await replaceDraftItemsForReview(
        ctx,
        draftId as Id<"aiExpenseDrafts">,
        groupId as Id<"groups">,
        items as UpdateForReviewItem[],
        now,
      );
    },
  };
}

export function createDraftExpenseEntryReconcileService(
  ctx: MutationCtx,
): DraftExpenseEntryReconcileService {
  return {
    async reconcile(args) {
      return await reconcileDraftExpenseEntries(ctx, {
        draft: draftFieldsToDoc(args.draft),
        groupId: args.groupId as Id<"groups">,
        userId: args.userId,
        items: args.items.map((item) => ({
          itemName: item.itemName,
          amountYen: item.amountYen,
          categoryId: item.categoryId as Id<"categories">,
        })),
        memoUpdate: args.memoUpdate,
        now: args.now,
      });
    },
  };
}

export function createDraftReceiptInsertService(ctx: MutationCtx): DraftReceiptInsertService {
  return {
    async insert(args) {
      return await insertReceiptForGroup(
        ctx,
        args.groupId as Id<"groups">,
        {
          type: "expense",
          date: args.fields.date,
          shopName: args.fields.shopName,
          amountYen: args.fields.amountYen,
          categoryId: args.fields.categoryId as Id<"categories">,
        },
        1,
        args.userId,
      );
    },
  };
}
