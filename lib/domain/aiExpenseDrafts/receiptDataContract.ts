import type { ReceiptItemTaxConfirmedField } from "../receipt/tax/types";
import type {
  AiExpenseDraftConfidence,
  AiExpenseDraftDocumentType,
  AiExpenseDraftReviewReason,
  AiExpenseDraftStatus,
} from "./constants";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  TaxAllocationStatus,
  TaxRatePercent,
  TaxResolutionSource,
  TaxResolutionStatus,
} from "../receipt/tax/types";
import type { ReceiptLineClassification } from "../receipt/observations";
import type { ReceiptItemLineType } from "../receipt/discountItems";

export type ReceiptDraftItemSnapshot<TCategoryId = string> = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: TaxAllocationStatus;
  normalizedAmountYen?: number;
  taxResolutionStatus?: TaxResolutionStatus;
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
  taxConfirmedFields?: ReceiptItemTaxConfirmedField[];
  quantity?: number;
  unitPriceYen?: number;
  categoryName?: string;
  categoryId?: TCategoryId;
  confidence: {
    itemName?: number;
    amountYen?: number;
    categoryName?: number;
    categoryId?: number;
  };
  warnings?: string[];
};

export type ReceiptDraftValueSnapshot<TCategoryId = string> = {
  status: AiExpenseDraftStatus;
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  registrationMode?: AiExpenseRegistrationMode;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  receiptLineClassifications?: ReceiptLineClassification[];
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: TCategoryId;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  reviewReasons: AiExpenseDraftReviewReason[];
  items: ReceiptDraftItemSnapshot<TCategoryId>[];
};

export const RECEIPT_INTERPRETATION_SOURCES = ["ai", "legacy_projection"] as const;

export type ReceiptInterpretationSource = (typeof RECEIPT_INTERPRETATION_SOURCES)[number];

export type ReceiptInterpretationSnapshot<TCategoryId = string> = {
  source: ReceiptInterpretationSource;
  interpretedAt: number;
  values: ReceiptDraftValueSnapshot<TCategoryId>;
};

export type ReceiptUserOverrideSnapshot<TCategoryId = string> = {
  /** 廃止した編集フォームの訂正履歴。対象額は計算への再入力に使わない。 */
  taxSummaryCorrections?: ExtractedTaxSummary[];
  source: "user";
  updatedAt: number;
  fields: string[];
  values: ReceiptDraftValueSnapshot<TCategoryId>;
};

/** 全体設定で明示した軸を、商品・内訳補正から導かれた判定と区別する。 */
export const RECEIPT_TAX_CHOICE_FIELDS = {
  priceTaxTreatment: "receiptTaxDecision.priceTaxTreatment",
  taxRateComposition: "receiptTaxDecision.taxRateComposition",
} as const;

export const AI_EXPENSE_REGISTRATION_MODES = ["detailed", "totalOnly"] as const;

export type AiExpenseRegistrationMode = (typeof AI_EXPENSE_REGISTRATION_MODES)[number];

export const REGISTRATION_DESTINATIONS = ["receipt", "expense_entries"] as const;

export type RegistrationDestination = (typeof REGISTRATION_DESTINATIONS)[number];

/** receiptDataContractVersion の現在値。新規解析だけがこの値を dual-write する。 */
export const RECEIPT_DATA_CONTRACT_VERSION = 1 as const;

export type ReceiptDataContractVersion = typeof RECEIPT_DATA_CONTRACT_VERSION;

export type DerivedRegistrationSnapshot<TCategoryId = string> = {
  source: "derived";
  destination: RegistrationDestination;
  registrationMode?: AiExpenseRegistrationMode;
  taxRatePercent?: TaxRatePercent | null;
  taxableAmountYen?: number | null;
  taxYen?: number | null;
  amountYen: number;
  date: string;
  categoryIds: TCategoryId[];
  registeredAt: number;
};

const TOP_LEVEL_OVERRIDE_FIELDS = [
  "documentType",
  "shopName",
  "paymentPlace",
  "payeeName",
  "paymentPurpose",
  "date",
  "amountYen",
  "registrationMode",
  "receiptTotalResolution",
  "receiptTaxDecision",
  "markerDefinitions",
  "categoryId",
] as const;

export function applyReceiptUserOverride<TCategoryId>(
  aiValues: ReceiptDraftValueSnapshot<TCategoryId>,
  override: ReceiptUserOverrideSnapshot<TCategoryId> | undefined,
): ReceiptDraftValueSnapshot<TCategoryId> {
  if (override === undefined) {
    return aiValues;
  }

  const fields = new Set(override.fields);
  const merged: ReceiptDraftValueSnapshot<TCategoryId> = {
    ...aiValues,
    confidence: { ...aiValues.confidence },
  };
  for (const field of TOP_LEVEL_OVERRIDE_FIELDS) {
    if (!fields.has(field)) {
      continue;
    }
    merged[field] = override.values[field] as never;
    const confidenceField = field as keyof typeof merged.confidence;
    if (override.values.confidence[confidenceField] !== undefined) {
      merged.confidence[confidenceField] = override.values.confidence[confidenceField];
    }
  }
  if (fields.has("items")) {
    merged.items = override.values.items;
  }
  if (fields.has("taxSummaries")) {
    merged.taxSummaries = override.values.taxSummaries;
  }
  return merged;
}

/** スナップショット構築に必要な draft の最小形状。warnings 未設定は空配列へ正規化する。 */
export type ReceiptDraftSnapshotSource<TCategoryId = string> = Omit<
  ReceiptDraftValueSnapshot<TCategoryId>,
  "items" | "warnings" | "receiptLineClassifications"
> & {
  warnings?: string[];
  receiptInterpretation?: {
    values: { receiptLineClassifications?: ReceiptLineClassification[] };
  };
};

/** draft・明細からスナップショットを構築する純粋射影。 */
export function snapshotReceiptDraftValues<TCategoryId>(
  draft: ReceiptDraftSnapshotSource<TCategoryId>,
  items: readonly ReceiptDraftItemSnapshot<TCategoryId>[],
): ReceiptDraftValueSnapshot<TCategoryId> {
  return {
    status: draft.status,
    documentType: draft.documentType,
    shopName: draft.shopName,
    paymentPlace: draft.paymentPlace,
    payeeName: draft.payeeName,
    paymentPurpose: draft.paymentPurpose,
    date: draft.date,
    amountYen: draft.amountYen,
    registrationMode: draft.registrationMode,
    taxSummaries: draft.taxSummaries,
    receiptTotalResolution: draft.receiptTotalResolution,
    receiptTaxDecision: draft.receiptTaxDecision,
    receiptLineClassifications: draft.receiptInterpretation?.values.receiptLineClassifications,
    markerDefinitions: draft.markerDefinitions,
    categoryId: draft.categoryId,
    confidence: draft.confidence,
    warnings: draft.warnings ?? [],
    reviewReasons: draft.reviewReasons,
    items: items.map((item) => ({
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: item.amountYen,
      printedAmountYen: item.printedAmountYen,
      amountBasis: item.amountBasis,
      taxRatePercent: item.taxRatePercent,
      markers: item.markers,
      taxMarker: item.taxMarker,
      allocatedTaxYen: item.allocatedTaxYen,
      taxAllocationStatus: item.taxAllocationStatus,
      normalizedAmountYen: item.normalizedAmountYen,
      taxResolutionStatus: item.taxResolutionStatus,
      taxResolutionSource: item.taxResolutionSource,
      taxReviewReasons: item.taxReviewReasons,
      taxConfirmedFields: item.taxConfirmedFields,
      quantity: item.quantity,
      unitPriceYen: item.unitPriceYen,
      categoryName: item.categoryName,
      categoryId: item.categoryId,
      confidence: item.confidence,
      warnings: item.warnings,
    })),
  };
}

/** 補正対象は累積し、税判定を更新するときは全体設定の軸の記録を置き換える。 */
export function buildReceiptUserOverride<TCategoryId>(args: {
  existingFields?: readonly string[];
  taxSummaryCorrections?: ExtractedTaxSummary[];
  fields: readonly string[];
  updatedAt: number;
  values: ReceiptDraftValueSnapshot<TCategoryId>;
}): ReceiptUserOverrideSnapshot<TCategoryId> {
  const taxChoiceFields: readonly string[] = Object.values(RECEIPT_TAX_CHOICE_FIELDS);
  const existingFields = args.fields.includes("receiptTaxDecision")
    ? args.existingFields?.filter((field) => !taxChoiceFields.includes(field))
    : args.existingFields;
  return {
    source: "user",
    ...(args.taxSummaryCorrections?.length
      ? { taxSummaryCorrections: args.taxSummaryCorrections }
      : {}),
    updatedAt: args.updatedAt,
    fields: [...new Set([...(existingFields ?? []), ...args.fields])],
    values: args.values,
  };
}

export function resolveReceiptTaxChoices(draft: {
  receiptUserOverride?: ReceiptUserOverrideSnapshot;
  receiptTaxDecision?: ReceiptTaxDecision;
  registrationMode?: AiExpenseRegistrationMode;
}): {
  priceTaxTreatment?: ReceiptTaxDecision["priceTaxTreatment"];
  taxRateComposition?: ReceiptTaxDecision["taxRateComposition"];
} {
  const fields = draft.receiptUserOverride?.fields ?? [];
  const legacyUnknown =
    fields.includes("receiptTaxDecision") &&
    (draft.registrationMode === "totalOnly" ||
      (!fields.includes("items") && !fields.includes("taxSummaries")));
  return {
    priceTaxTreatment:
      fields.includes(RECEIPT_TAX_CHOICE_FIELDS.priceTaxTreatment) ||
      (legacyUnknown && draft.receiptTaxDecision?.priceTaxTreatment === "unknown")
        ? draft.receiptTaxDecision?.priceTaxTreatment
        : undefined,
    taxRateComposition:
      fields.includes(RECEIPT_TAX_CHOICE_FIELDS.taxRateComposition) ||
      (legacyUnknown && draft.receiptTaxDecision?.taxRateComposition === "unknown")
        ? draft.receiptTaxDecision?.taxRateComposition
        : undefined,
  };
}

export function resolveReceiptTaxCorrections(
  override: ReceiptUserOverrideSnapshot | undefined,
  originalSummaries?: ExtractedTaxSummary[],
): ExtractedTaxSummary[] | undefined {
  if (override?.taxSummaryCorrections) return override.taxSummaryCorrections;
  if (!override?.fields.includes("taxSummaries")) return undefined;
  const summaries = override.values.taxSummaries ?? [];
  const isolatedLegacyEdit = override.fields.every((field) => field === "taxSummaries");
  return summaries
    .filter((summary) => summary.valueOrigin?.source !== "items")
    .map((summary) => {
      if (summary.userEditedFields?.length || summary.valueOrigin || !isolatedLegacyEdit) {
        return summary;
      }
      const originals = originalSummaries?.filter(
        (original) => original.taxRatePercent === summary.taxRatePercent,
      );
      const matchingEdits = summaries.filter(
        (edit) => edit.taxRatePercent === summary.taxRatePercent,
      );
      return originals?.length === 1 &&
        originals[0].valueOrigin?.source !== "items" &&
        matchingEdits.length === 1 &&
        originals[0].taxYen !== summary.taxYen
        ? { ...summary, userEditedFields: ["taxYen"] }
        : summary;
    });
}
