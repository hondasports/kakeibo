/**
 * aiExpenseDrafts のドメインオブジェクト。
 * 所有権判定・状態遷移ガード・登録モード解決といった知識を集約する。
 * Convex の generated 型には依存せず、ID は string として扱う。
 */
import type {
  AiExpenseDraftConfidence,
  AiExpenseDraftDocumentType,
  AiExpenseDraftReviewReason,
  AiExpenseDraftSourceType,
  AiExpenseDraftStatus,
} from "./constants";
import type {
  AiExpenseRegistrationMode,
  DerivedRegistrationSnapshot,
  ReceiptInterpretationSnapshot,
  ReceiptUserOverrideSnapshot,
} from "./receiptDataContract";
import type {
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
} from "../receipt/tax/types";
import type { ReceiptRawObservation } from "../receipt/observations";

/** aiExpenseDrafts ドキュメントのフィールド。id/creationTime は永続化済みの場合のみ存在する。 */
export type AiExpenseDraftFields = {
  id?: string;
  creationTime?: number;
  groupId: string;
  createdByUserId?: string;
  sourceType: AiExpenseDraftSourceType;
  status: AiExpenseDraftStatus;
  documentType: AiExpenseDraftDocumentType;
  imageFileName?: string;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  receiptDataContractVersion?: 1;
  rawObservation?: ReceiptRawObservation;
  receiptInterpretation?: ReceiptInterpretationSnapshot;
  receiptUserOverride?: ReceiptUserOverrideSnapshot;
  registrationMode?: AiExpenseRegistrationMode;
  derivedRegistration?: DerivedRegistrationSnapshot;
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: string;
  confidence: AiExpenseDraftConfidence;
  warnings?: string[];
  reviewReasons: AiExpenseDraftReviewReason[];
  registeredReceiptId?: string;
  createdAt: number;
  updatedAt: number;
};

/** 下書きに対する部分更新 patch。id/creationTime は含めない。 */
export type AiExpenseDraftPatch = Partial<Omit<AiExpenseDraftFields, "id" | "creationTime">>;

export class AiExpenseDraft {
  private readonly fields: AiExpenseDraftFields;

  private constructor(fields: AiExpenseDraftFields) {
    this.fields = fields;
  }

  /** 永続化済みドキュメントから復元する（再検証しない）。 */
  static fromPersisted(fields: AiExpenseDraftFields): AiExpenseDraft {
    return new AiExpenseDraft(fields);
  }

  get id(): string | undefined {
    return this.fields.id;
  }

  get status(): AiExpenseDraftStatus {
    return this.fields.status;
  }

  get registrationMode(): AiExpenseRegistrationMode {
    return this.fields.registrationMode ?? "detailed";
  }

  /** 永続化フィールドへの読み取りアクセス（patch 構築・サービス入力用）。 */
  get persisted(): AiExpenseDraftFields {
    return this.fields;
  }

  /** 指定グループに属するか。データ境界の知識。 */
  belongsToGroup(groupId: string): boolean {
    return this.fields.groupId === groupId;
  }

  isRegistered(): boolean {
    return this.fields.status === "registered";
  }

  /**
   * レガシーな receipts 登録（registeredReceiptId / destination=receipt）か。
   * その場合は AI キュー・履歴どちらからも編集できない。
   */
  hasLegacyReceiptRegistration(): boolean {
    return (
      this.fields.registeredReceiptId !== undefined ||
      this.fields.derivedRegistration?.destination === "receipt"
    );
  }

  /** キューから削除可能か検証する。失敗時は Error を投げる。 */
  assertDeletableFromQueue(): void {
    if (this.isRegistered()) {
      throw new Error("Registered AI expense draft cannot be deleted from the queue");
    }
  }

  /** AI キューから編集可能か検証する。失敗時は Error を投げる。 */
  assertEditableFromQueue(): void {
    if (this.isRegistered()) {
      throw new Error("Registered AI expense draft cannot be edited");
    }
    if (this.fields.status !== "needs_review" && this.fields.status !== "ready") {
      throw new Error("Only needs_review or ready AI expense drafts can be edited");
    }
  }

  /** AI キューからのレビュー更新を許可するか検証する。失敗時は Error を投げる。 */
  assertReviewableFromQueue(): void {
    if (this.isRegistered()) {
      if (this.hasLegacyReceiptRegistration()) {
        throw new Error("Legacy receipt registrations cannot be edited from the AI queue");
      }
      return;
    }
    if (this.fields.status !== "needs_review" && this.fields.status !== "ready") {
      throw new Error("Only needs_review or ready AI expense drafts can be edited");
    }
  }

  /** 履歴（registered）からの編集を許可するか検証する。失敗時は Error を投げる。 */
  assertEditableFromHistory(): void {
    if (!this.isRegistered()) {
      throw new Error("Only registered AI expense drafts can be edited from history");
    }
    if (this.hasLegacyReceiptRegistration()) {
      throw new Error("Legacy receipt registrations cannot be edited from history");
    }
  }

  /** AI 解釈スナップショットへのリセットが可能か検証する。失敗時は Error を投げる。 */
  assertResettableToAiInterpretation(): void {
    if (this.isRegistered()) {
      throw new Error("Registered AI expense draft cannot be reset");
    }
    if (this.fields.receiptInterpretation === undefined) {
      throw new Error("AI interpretation snapshot is not available for this legacy draft");
    }
  }

  /** 税再解釈に必要な前提（合計金額と税集計）を持つか検証する。失敗時は Error を投げる。 */
  assertHasTaxInterpretationBasis(): void {
    if (
      this.fields.amountYen === undefined ||
      !this.fields.taxSummaries ||
      this.fields.taxSummaries.length === 0
    ) {
      throw new Error("Tax reinterpretation requires draft amount and tax summaries");
    }
  }
}
