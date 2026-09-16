/**
 * ExpenseEntryRepository の Convex 実装。
 * domain 層の型（string ID）と Convex の Id<> の変換をここで吸収する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type {
  ExpenseEntryFields,
  ExpenseEntryUpdatePatch,
} from "../../domain/expenseEntries/expenseEntry";
import type { ExpenseEntryRepository } from "../../domain/expenseEntries/expenseEntryRepository";

function toFields(doc: Doc<"expenseEntries">): ExpenseEntryFields {
  const { _id, _creationTime, ...fields } = doc;
  return { ...fields, id: _id };
}

export function createExpenseEntryRepository(ctx: Pick<MutationCtx, "db">): ExpenseEntryRepository {
  return {
    async findById(id) {
      const doc = await ctx.db.get(id as Id<"expenseEntries">);
      return doc === null ? null : toFields(doc);
    },
    async insert(fields) {
      return await ctx.db.insert("expenseEntries", {
        ...fields,
        sourceDocumentId: fields.sourceDocumentId as Id<"sourceDocuments"> | undefined,
        aiExpenseDraftId: fields.aiExpenseDraftId as Id<"aiExpenseDrafts"> | undefined,
        categoryId: fields.categoryId as Id<"categories"> | undefined,
        groupId: fields.groupId as Id<"groups">,
      });
    },
    async patch(id, patch: ExpenseEntryUpdatePatch & { updatedAt: number }) {
      // Convex の patch は undefined を「フィールド削除」と解釈するため、
      // 指定のなかったキーは patch オブジェクトに含めてはいけない。
      const { categoryId, ...rest } = patch;
      await ctx.db.patch(id as Id<"expenseEntries">, {
        ...rest,
        ...(categoryId !== undefined ? { categoryId: categoryId as Id<"categories"> } : {}),
      });
    },
    async delete(id) {
      await ctx.db.delete(id as Id<"expenseEntries">);
    },
  };
}
