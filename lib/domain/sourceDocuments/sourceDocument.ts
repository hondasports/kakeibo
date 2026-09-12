/**
 * sourceDocuments（入出金の原本）のドメインオブジェクト。
 * 手動入力時の合計金額解決の知識を持つ。
 */
import { validateExpenseAmount } from "../expenseEntries/expenseEntryItem";

export type SourceDocumentFields = {
  groupId: string;
  sourceType: "manual" | "receipt" | "convenience_payment" | "invoice" | "unknown";
  status: "draft" | "ready" | "finalized";
  date?: string;
  totalAmount?: number;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  imageStorageId?: string;
  createdAt: number;
  updatedAt: number;
};

/** 手動入力 sourceDocument の作成入力。 */
export type ManualSourceDocumentInput = {
  groupId: string;
  date: string;
  shopName: string;
  /** 原本としての合計。未指定時は明細合計を使う。 */
  sourceAmountYen?: number;
  /** 明細合計（sourceAmountYen 未指定時の fallback）。 */
  itemsTotalAmountYen: number;
};

export class SourceDocument {
  private readonly fields: SourceDocumentFields;

  private constructor(fields: SourceDocumentFields) {
    this.fields = fields;
  }

  /** 永続化済みドキュメントから復元する（再検証しない）。 */
  static fromPersisted(fields: SourceDocumentFields): SourceDocument {
    return new SourceDocument(fields);
  }

  /**
   * 手動入力の sourceDocument を構築する。
   * 合計金額は sourceAmountYen 優先、未指定なら明細合計を使う。
   * 失敗時は Error を投げる。
   */
  static createManual(input: ManualSourceDocumentInput, now: number): SourceDocument {
    const totalAmount = input.sourceAmountYen ?? input.itemsTotalAmountYen;
    if (!validateExpenseAmount(totalAmount).success) {
      throw new Error("Source amount must be a positive integer");
    }
    return new SourceDocument({
      groupId: input.groupId,
      sourceType: "manual",
      status: "finalized",
      date: input.date,
      totalAmount,
      shopName: input.shopName.trim(),
      createdAt: now,
      updatedAt: now,
    });
  }

  /** 指定グループに属するか。データ境界の知識。 */
  belongsToGroup(groupId: string): boolean {
    return this.fields.groupId === groupId;
  }

  /** 新規 insert 用のフィールドを返す。 */
  toInsertFields(): SourceDocumentFields {
    return this.fields;
  }
}
