/**
 * aiExpenseDrafts ユースケースの依存組み立て（composition root）。
 * ctx に束縛したポート実装をまとめて返す。
 */
import type { MutationCtx, QueryCtx } from "../../../convex/_generated/server";
import { createCategoryRepository } from "../categories/categoryRepository";
import {
  createAiExpenseDraftReadRepository,
  createAiExpenseDraftRepository,
} from "./convexAiExpenseDraftRepository";
import {
  createAiExpenseDraftItemReadRepository,
  createAiExpenseDraftItemRepository,
} from "./convexAiExpenseDraftItemRepository";
import {
  createDraftExpenseEntryReconcileService,
  createDraftItemReplaceService,
  createDraftOverrideSnapshotService,
  createDraftReceiptInsertService,
  createDraftTaxInterpretationService,
} from "./convexDraftWorkflowServices";

export function createAiExpenseDraftDeps(ctx: MutationCtx) {
  return {
    drafts: createAiExpenseDraftRepository(ctx),
    draftItems: createAiExpenseDraftItemRepository(ctx),
    categories: createCategoryRepository(ctx),
    taxInterpretation: createDraftTaxInterpretationService(ctx),
    overrideSnapshots: createDraftOverrideSnapshotService(ctx),
    itemReplace: createDraftItemReplaceService(ctx),
    expenseEntryReconcile: createDraftExpenseEntryReconcileService(ctx),
    receiptInsert: createDraftReceiptInsertService(ctx),
  };
}

/** query 系ユースケースが必要とする読み取りポートのみを組み立てる。 */
export function createAiExpenseDraftQueryDeps(ctx: Pick<QueryCtx, "db">) {
  return {
    drafts: createAiExpenseDraftReadRepository(ctx),
    draftItems: createAiExpenseDraftItemReadRepository(ctx),
  };
}
