/**
 * expenseEntries 系 mutation のハンドラグルー。
 * 認証・グループ解決と依存構築（composition）だけを行い、
 * 業務ロジックは lib/usecase に委譲する。
 */
import type { MutationCtx } from "../../../convex/_generated/server";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireGroupMembership } from "../../../convex/groups/membership";
import { createCategoryRepository } from "../categories/categoryRepository";
import { createSourceDocumentRepository } from "../sourceDocuments/sourceDocumentRepository";
import { createExpenseEntryRepository } from "./expenseEntryRepository";
import { createIncomeEntry } from "../../usecase/expenseEntries/createIncomeEntry";
import { createExpenseEntries } from "../../usecase/expenseEntries/createExpenseEntries";
import { updateExpenseEntry } from "../../usecase/expenseEntries/updateExpenseEntry";
import { deleteExpenseEntry } from "../../usecase/expenseEntries/deleteExpenseEntry";

export type CreateIncomeEntryArgs = {
  date: string;
  amountYen: number;
  title: string;
};

export type CreateExpenseEntriesArgs = {
  date: string;
  shopName?: string;
  sourceAmountYen?: number;
  sourceDocumentId?: Id<"sourceDocuments">;
  items: Array<{
    categoryId: Id<"categories">;
    amountYen: number;
    title: string;
    memo?: string;
  }>;
};

export type UpdateExpenseEntryArgs = {
  expenseEntryId: Id<"expenseEntries">;
  date?: string;
  amountYen?: number;
  categoryId?: Id<"categories">;
  title?: string;
  memo?: string;
};

export type DeleteExpenseEntryArgs = {
  expenseEntryId: Id<"expenseEntries">;
};

export async function createIncomeEntryHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: CreateIncomeEntryArgs,
): Promise<Id<"expenseEntries">> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  return (await createIncomeEntry(
    { groupId, userId },
    { expenseEntries: createExpenseEntryRepository(ctx) },
    args,
  )) as Id<"expenseEntries">;
}

export async function createExpenseEntriesHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: CreateExpenseEntriesArgs,
): Promise<void> {
  const { groupId, userId } = await requireGroupMembership(ctx);
  await createExpenseEntries(
    { groupId, userId },
    {
      expenseEntries: createExpenseEntryRepository(ctx),
      sourceDocuments: createSourceDocumentRepository(ctx),
      categories: createCategoryRepository(ctx),
    },
    args,
  );
}

export async function updateExpenseEntryHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: UpdateExpenseEntryArgs,
): Promise<Id<"expenseEntries">> {
  const { groupId } = await requireGroupMembership(ctx);
  return (await updateExpenseEntry(
    { groupId },
    {
      expenseEntries: createExpenseEntryRepository(ctx),
      categories: createCategoryRepository(ctx),
    },
    args,
  )) as Id<"expenseEntries">;
}

export async function deleteExpenseEntryHandler(
  ctx: Pick<MutationCtx, "auth" | "db">,
  args: DeleteExpenseEntryArgs,
): Promise<void> {
  const { groupId } = await requireGroupMembership(ctx);
  await deleteExpenseEntry(
    { groupId },
    { expenseEntries: createExpenseEntryRepository(ctx) },
    args,
  );
}
