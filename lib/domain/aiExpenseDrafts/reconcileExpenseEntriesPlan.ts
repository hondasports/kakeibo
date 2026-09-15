import type { DraftRegistrationItem } from "./registrationItems";

export class ReconcileExpenseEntriesDomainError extends Error {}

/** 調整対象として必要な既存エントリの形状。 */
export type ReconcilableExpenseEntry = {
  _id: string;
  categoryId?: string;
};

export type ExpenseEntryPatchFields = {
  date: string;
  amount: number;
  categoryId: string;
  title: string;
  memo?: string;
  entryType: "expense";
  source: "ai_suggested";
  updatedAt: number;
};

export type ExpenseEntryInsertFields = {
  groupId: string;
  createdByUserId: string;
  aiExpenseDraftId: string;
  date: string;
  amount: number;
  categoryId: string;
  title: string;
  memo?: string;
  entryType: "expense";
  source: "ai_suggested";
  createdAt: number;
  updatedAt: number;
};

export type ExpenseEntryReconciliationOp =
  | { kind: "patch"; entryId: string; categoryId: string; fields: ExpenseEntryPatchFields }
  | { kind: "insert"; categoryId: string; fields: ExpenseEntryInsertFields };

export type ExpenseEntryReconciliationPlan = {
  /** 明細と同順の適用ops。infraは各op適用前にカテゴリ検証を行う。 */
  ops: ExpenseEntryReconciliationOp[];
  /** ops適用後に削除する既存エントリID。 */
  deleteIds: string[];
};

const MAX_RECONCILED_ENTRIES = 100;

/**
 * 下書きに紐づく支出エントリの upsert/delete 計画を立てる。
 * 既存エントリはカテゴリ一致を優先して再利用し、残りは削除する。
 */
export function planExpenseEntryReconciliation(args: {
  existing: ReconcilableExpenseEntry[];
  items: DraftRegistrationItem[];
  draftId: string;
  draftDate: string;
  groupId: string;
  userId: string;
  memoUpdate?: { value?: string };
  now: number;
}): ExpenseEntryReconciliationPlan {
  if (args.existing.length > MAX_RECONCILED_ENTRIES) {
    throw new ReconcileExpenseEntriesDomainError(
      "Too many expense entries are linked to this draft",
    );
  }

  const retainedIds = new Set<string>();
  const ops: ExpenseEntryReconciliationOp[] = [];
  for (const item of args.items) {
    const reusable =
      args.existing.find(
        (entry) => entry.categoryId === item.categoryId && !retainedIds.has(entry._id),
      ) ?? args.existing.find((entry) => !retainedIds.has(entry._id));
    if (reusable) {
      retainedIds.add(reusable._id);
      ops.push({
        kind: "patch",
        entryId: reusable._id,
        categoryId: item.categoryId,
        fields: {
          date: args.draftDate,
          amount: item.amountYen,
          categoryId: item.categoryId,
          title: item.itemName,
          ...(args.memoUpdate === undefined ? {} : { memo: args.memoUpdate.value }),
          entryType: "expense",
          source: "ai_suggested",
          updatedAt: args.now,
        },
      });
      continue;
    }
    ops.push({
      kind: "insert",
      categoryId: item.categoryId,
      fields: {
        groupId: args.groupId,
        createdByUserId: args.userId,
        aiExpenseDraftId: args.draftId,
        date: args.draftDate,
        amount: item.amountYen,
        categoryId: item.categoryId,
        title: item.itemName,
        ...(args.memoUpdate?.value === undefined ? {} : { memo: args.memoUpdate.value }),
        entryType: "expense",
        source: "ai_suggested",
        createdAt: args.now,
        updatedAt: args.now,
      },
    });
  }

  // resultIds は patched（=retained）+ 新規 insert なので、既存エントリに対して
  // 「retained でない」だけで削除対象と一致する。
  const deleteIds = args.existing
    .filter((entry) => !retainedIds.has(entry._id))
    .map((entry) => entry._id);

  return { ops, deleteIds };
}
