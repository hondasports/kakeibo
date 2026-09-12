/**
 * expenseEntries のドメインオブジェクト。
 * 所有権判定・更新 patch 構築・一括操作可否といった知識を集約する。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import { isValidIsoDateString } from "../week/weekDates";
import {
  buildDraftExpenseEntry,
  getDraftExpenseEntryErrorMessage,
  type DraftExpenseEntryInput,
} from "./createFromDraft";
import {
  validateExpenseAmount,
  validateExpenseMemo,
  validateExpenseTitle,
} from "./expenseEntryItem";

export type ExpenseEntryType = "expense" | "income";
export type ExpenseEntrySource = "manual" | "ai_suggested" | "imported";

/** expenseEntries ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type ExpenseEntryFields = {
  id?: string;
  groupId: string;
  createdByUserId?: string;
  sourceDocumentId?: string;
  aiExpenseDraftId?: string;
  date: string;
  amount: number;
  categoryId?: string;
  title: string;
  memo?: string;
  entryType: ExpenseEntryType;
  source: ExpenseEntrySource;
  createdAt: number;
  updatedAt: number;
};

/** 手動入力の支出エントリ作成入力。 */
export type ManualExpenseInput = {
  groupId: string;
  createdByUserId: string;
  sourceDocumentId?: string;
  date: string;
  amountYen: number;
  categoryId: string;
  title: string;
  memo?: string;
};

/** 手動入力の収入エントリ作成入力。 */
export type ManualIncomeInput = {
  groupId: string;
  createdByUserId: string;
  date: string;
  amountYen: number;
  title: string;
};

/** AI 下書き明細からの支出エントリ作成入力。 */
export type DraftExpenseEntryCreateInput = {
  groupId: string;
  createdByUserId: string;
  draftId: string;
  draftDate: string;
  draftCategoryId?: string;
  item: DraftExpenseEntryInput;
};

/** 更新入力（未指定フィールドは変更しない）。 */
export type ExpenseEntryUpdateInput = {
  date?: string;
  amountYen?: number;
  categoryId?: string;
  title?: string;
  memo?: string;
};

/** 更新 patch（永続化フィールド名）。updatedAt はユースケース側で付与する。 */
export type ExpenseEntryUpdatePatch = {
  date?: string;
  amount?: number;
  categoryId?: string;
  title?: string;
  memo?: string;
};

export class ExpenseEntry {
  private readonly fields: ExpenseEntryFields;

  private constructor(fields: ExpenseEntryFields) {
    this.fields = fields;
  }

  /** 永続化済みドキュメントから復元する（再検証しない）。 */
  static fromPersisted(fields: ExpenseEntryFields): ExpenseEntry {
    return new ExpenseEntry(fields);
  }

  /** 手動入力の支出エントリを構築する。不変条件はここで確定する。 */
  static createManualExpense(input: ManualExpenseInput, now: number): ExpenseEntry {
    if (!validateExpenseAmount(input.amountYen).success) {
      throw new Error("Amount must be a positive integer");
    }
    const titleResult = validateExpenseTitle(input.title);
    if (!titleResult.success) {
      throw new Error("Title is required");
    }
    const memoResult = validateExpenseMemo(input.memo);
    if (!memoResult.success) {
      throw new Error("Memo must be 500 characters or less");
    }
    return new ExpenseEntry({
      groupId: input.groupId,
      createdByUserId: input.createdByUserId,
      sourceDocumentId: input.sourceDocumentId,
      date: input.date,
      amount: input.amountYen,
      categoryId: input.categoryId,
      title: titleResult.title,
      memo: memoResult.memo,
      entryType: "expense",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
  }

  /** 手動入力の収入エントリを構築する。日付もここで検証する。 */
  static createManualIncome(input: ManualIncomeInput, now: number): ExpenseEntry {
    if (!input.date.trim() || !isValidIsoDateString(input.date)) {
      throw new Error("Date must be a valid YYYY-MM-DD value");
    }
    if (!validateExpenseAmount(input.amountYen).success) {
      throw new Error("Amount must be a positive integer");
    }
    const titleResult = validateExpenseTitle(input.title);
    if (!titleResult.success) {
      throw new Error("Income description is required");
    }
    return new ExpenseEntry({
      groupId: input.groupId,
      createdByUserId: input.createdByUserId,
      date: input.date,
      amount: input.amountYen,
      title: titleResult.title,
      entryType: "income",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
  }

  /** AI 下書き明細から支出エントリを構築する。 */
  static createFromDraftItem(input: DraftExpenseEntryCreateInput, now: number): ExpenseEntry {
    const buildResult = buildDraftExpenseEntry(input.item, input.draftCategoryId);
    if (!buildResult.success) {
      throw new Error(getDraftExpenseEntryErrorMessage(buildResult.error));
    }
    return new ExpenseEntry({
      groupId: input.groupId,
      createdByUserId: input.createdByUserId,
      aiExpenseDraftId: input.draftId,
      date: input.draftDate,
      amount: buildResult.entry.amount,
      categoryId: buildResult.entry.categoryId,
      title: buildResult.entry.title,
      entryType: "expense",
      source: "ai_suggested",
      createdAt: now,
      updatedAt: now,
    });
  }

  get id(): string | undefined {
    return this.fields.id;
  }

  get groupId(): string {
    return this.fields.groupId;
  }

  get categoryId(): string | undefined {
    return this.fields.categoryId;
  }

  get date(): string {
    return this.fields.date;
  }

  /** 指定グループに属するか。データ境界の知識。 */
  belongsToGroup(groupId: string): boolean {
    return this.fields.groupId === groupId;
  }

  /** 支出レコードか。一括支出操作は収入を含められない。 */
  isSpendingRecord(): boolean {
    return this.fields.entryType === "expense";
  }

  /**
   * 更新入力を検証し、永続化用の patch を構築する。
   * 指定されたフィールドのみを含む patch を返す。失敗時は Error を投げる。
   */
  buildUpdatePatch(input: ExpenseEntryUpdateInput): ExpenseEntryUpdatePatch {
    const patch: ExpenseEntryUpdatePatch = {};

    if (input.amountYen !== undefined) {
      if (!validateExpenseAmount(input.amountYen).success) {
        throw new Error("Amount must be a positive integer");
      }
      patch.amount = input.amountYen;
    }
    if (input.date !== undefined) {
      if (!input.date.trim() || !isValidIsoDateString(input.date)) {
        throw new Error("Date must be a valid YYYY-MM-DD value");
      }
      patch.date = input.date;
    }
    if (input.categoryId !== undefined) {
      patch.categoryId = input.categoryId;
    }
    if (input.title !== undefined) {
      const titleResult = validateExpenseTitle(input.title);
      if (!titleResult.success) {
        throw new Error("Title is required");
      }
      patch.title = titleResult.title;
    }
    if (input.memo !== undefined) {
      const memoResult = validateExpenseMemo(input.memo);
      if (!memoResult.success) {
        throw new Error("Memo must be 500 characters or less");
      }
      patch.memo = memoResult.memo;
    }

    return patch;
  }

  /** 新規 insert 用のフィールドを返す（id は含まない）。 */
  toInsertFields(): Omit<ExpenseEntryFields, "id"> {
    const { id: _id, ...fields } = this.fields;
    return fields;
  }
}
