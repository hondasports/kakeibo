/**
 * aiExpenseDrafts ユースケース共通の依存ポート。
 */
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import type { AiExpenseDraftRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftRepository";
import type { AiExpenseDraftItemRepository } from "../../domain/aiExpenseDrafts/aiExpenseDraftItemRepository";
import type {
  DraftExpenseEntryReconcileService,
  DraftItemReplaceService,
  DraftOverrideSnapshotService,
  DraftReceiptInsertService,
  DraftTaxInterpretationService,
} from "../../domain/aiExpenseDrafts/draftWorkflowServices";

export type AiExpenseDraftDeps = {
  drafts: AiExpenseDraftRepository;
  draftItems: AiExpenseDraftItemRepository;
  categories: CategoryRepository;
  taxInterpretation: DraftTaxInterpretationService;
  overrideSnapshots: DraftOverrideSnapshotService;
  itemReplace: DraftItemReplaceService;
  expenseEntryReconcile: DraftExpenseEntryReconcileService;
  receiptInsert: DraftReceiptInsertService;
};
