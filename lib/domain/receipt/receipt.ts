/**
 * receipts のドメインオブジェクト。
 * 所有権判定・更新 patch 構築（weekStartDate 再計算を含む）の知識を集約する。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import { calculateWeekStartDate } from "../week/weekDates";
import {
  normalizeCreateReceiptArgs,
  normalizeUpdateReceiptPatch,
  type CreateReceiptInput,
  type UpdateReceiptInput,
} from "./normalize";
import { isExpenseReceiptType } from "../spending/bulkSpending";

/** receipts ドキュメントのフィールド。id は永続化済みの場合のみ存在する。 */
export type ReceiptFields = {
  id?: string;
  groupId: string;
  createdByUserId?: string;
  date: string;
  type?: "expense" | "income";
  shopName?: string;
  bankName?: string;
  amountYen: number;
  categoryId: string;
  memo?: string;
  weekStartDate: string;
  createdAt: number;
  updatedAt: number;
};

/** 更新 patch（永続化フィールド名）。updatedAt はユースケース側で付与する。 */
export type ReceiptUpdatePatch = {
  date?: string;
  shopName?: string;
  bankName?: string;
  amountYen?: number;
  categoryId?: string;
  memo?: string;
  weekStartDate?: string;
};

export class Receipt {
  private readonly fields: ReceiptFields;

  private constructor(fields: ReceiptFields) {
    this.fields = fields;
  }

  /** 永続化済みドキュメントから復元する（再検証しない）。 */
  static fromPersisted(fields: ReceiptFields): Receipt {
    return new Receipt(fields);
  }

  /**
   * レシートを構築する。入力の検証・正規化と weekStartDate 計算をここで確定する。
   * 失敗時は Error を投げる。
   */
  static create(
    input: CreateReceiptInput,
    context: { groupId: string; createdByUserId: string; weeklyStartDay: number },
    now: number,
  ): Receipt {
    const normalized = normalizeCreateReceiptArgs(input);
    return new Receipt({
      groupId: context.groupId,
      createdByUserId: context.createdByUserId,
      date: normalized.date,
      type: normalized.type,
      shopName: normalized.shopName,
      bankName: normalized.bankName,
      amountYen: normalized.amountYen,
      categoryId: normalized.categoryId,
      memo: normalized.memo,
      weekStartDate: calculateWeekStartDate(normalized.date, context.weeklyStartDay),
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

  get categoryId(): string {
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
  isExpenseRecord(): boolean {
    return isExpenseReceiptType(this.fields.type);
  }

  /**
   * 更新入力を検証し、永続化用の patch を構築する。
   * date が変更される場合は週開始曜日から weekStartDate を再計算する。
   * 失敗時は Error を投げる。
   */
  buildUpdatePatch(input: UpdateReceiptInput, weeklyStartDay: number): ReceiptUpdatePatch {
    const normalized = normalizeUpdateReceiptPatch(input);
    const patch: ReceiptUpdatePatch = { ...normalized };
    if (normalized.date !== undefined) {
      patch.weekStartDate = calculateWeekStartDate(normalized.date, weeklyStartDay);
    }
    if (input.categoryId !== undefined) {
      patch.categoryId = input.categoryId;
    }
    return patch;
  }

  /** 新規 insert 用のフィールドを返す（id は含まない）。 */
  toInsertFields(): Omit<ReceiptFields, "id"> {
    const { id: _id, ...fields } = this.fields;
    return fields;
  }
}
