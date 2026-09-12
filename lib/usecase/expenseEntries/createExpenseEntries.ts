import { ExpenseEntry } from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";
import type { CategoryRepository } from "../../domain/categories/categoryRepository";
import { SourceDocument } from "../../domain/sourceDocuments/sourceDocument";
import type { SourceDocumentRepository } from "../../domain/sourceDocuments/sourceDocumentRepository";
import { assertUsableCategory } from "../categories/assertUsableCategory";
import type { UsecaseGroupContext } from "../context";
import { toConvexError } from "../errors";

export type CreateExpenseEntriesUsecaseArgs = {
  date: string;
  shopName?: string;
  sourceAmountYen?: number;
  sourceDocumentId?: string;
  items: Array<{
    categoryId: string;
    amountYen: number;
    title: string;
    memo?: string;
  }>;
};

/**
 * 手動入力の支出エントリをまとめて作成する。
 * shopName が指定され sourceDocumentId が無い場合は sourceDocuments に原本を先に作る。
 */
export async function createExpenseEntries(
  ctx: UsecaseGroupContext,
  deps: {
    expenseEntries: ExpenseEntryRepository;
    sourceDocuments: SourceDocumentRepository;
    categories: CategoryRepository;
  },
  args: CreateExpenseEntriesUsecaseArgs,
): Promise<void> {
  const now = Date.now();
  let sourceDocumentId = args.sourceDocumentId;

  if (sourceDocumentId === undefined && args.shopName?.trim()) {
    let sourceDocument: SourceDocument;
    try {
      sourceDocument = SourceDocument.createManual(
        {
          groupId: ctx.groupId,
          date: args.date,
          shopName: args.shopName,
          sourceAmountYen: args.sourceAmountYen,
          itemsTotalAmountYen: args.items.reduce((sum, item) => sum + item.amountYen, 0),
        },
        now,
      );
    } catch (err) {
      throw toConvexError(err);
    }
    sourceDocumentId = await deps.sourceDocuments.insert(sourceDocument.toInsertFields());
  }

  for (const item of args.items) {
    let entry: ExpenseEntry;
    try {
      entry = ExpenseEntry.createManualExpense(
        {
          groupId: ctx.groupId,
          createdByUserId: ctx.userId,
          sourceDocumentId,
          date: args.date,
          amountYen: item.amountYen,
          categoryId: item.categoryId,
          title: item.title,
          memo: item.memo,
        },
        now,
      );
    } catch (err) {
      throw toConvexError(err);
    }

    await assertUsableCategory(deps.categories, item.categoryId, ctx.groupId);
    await deps.expenseEntries.insert(entry.toInsertFields());
  }
}
