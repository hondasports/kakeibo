/**
 * 抽出結果から AI 下書き（aiExpenseDrafts / aiExpenseDraftItems）の永続化フィールドを構築する純粋ルール。
 * 分類・ユーザー上書き適用・AI解釈スナップショットの構築を担い、DB 読み書きは infra に委ねる。
 * カテゴリ ID は永続化層の ID 型をそのまま通すため総称型で扱う。
 */
import type { ReceiptItemLineType } from "../receipt/discountItems";
import type { ReceiptLineClassification, ReceiptRawObservationLine } from "../receipt/observations";
import type {
  AmountBasis,
  ExtractedTaxSummary,
  ReceiptMarkerDefinition,
  ReceiptTaxDecision,
  ReceiptTotalResolution,
  TaxRatePercent,
  TaxResolutionSource,
} from "../receipt/tax/types";
import { classifyCreatedDraft, type CreatedDraftClassificationInput } from "./classification";
import type {
  AiExpenseDraftConfidence,
  AiExpenseDraftDocumentType,
  AiExpenseDraftReviewReason,
} from "./constants";
import {
  applyReceiptUserOverride,
  type ReceiptDraftValueSnapshot,
  type ReceiptUserOverrideSnapshot,
} from "./receiptDataContract";

export const DRAFT_CATEGORY_NOT_IN_GROUP_MESSAGE = "Category does not belong to the current group";
export const DRAFT_NOT_FOUND_AFTER_CREATION_MESSAGE =
  "AI expense draft was not found after creation";
export const ACTIVE_GROUP_REQUIRED_MESSAGE = "Active group is required";

export type ExtractedDraftItemInput<TCategoryId extends string = string> = {
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: number;
  printedAmountYen?: number;
  amountBasis?: AmountBasis;
  taxRatePercent?: TaxRatePercent | null;
  markers?: string[];
  taxMarker?: string;
  allocatedTaxYen?: number;
  taxAllocationStatus?: "allocated" | "unallocated";
  normalizedAmountYen?: number;
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxReviewReasons?: string[];
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

export type ExtractedDraftInput<TCategoryId extends string = string> = {
  documentType: AiExpenseDraftDocumentType;
  shopName?: string;
  paymentPlace?: string;
  payeeName?: string;
  paymentPurpose?: string;
  date?: string;
  amountYen?: number;
  taxSummaries?: ExtractedTaxSummary[];
  receiptTotalResolution?: ReceiptTotalResolution;
  receiptTaxDecision?: ReceiptTaxDecision;
  rawObservationLines?: ReceiptRawObservationLine[];
  receiptLineClassifications?: ReceiptLineClassification[];
  preservedUserOverride?: ReceiptUserOverrideSnapshot<TCategoryId>;
  markerDefinitions?: ReceiptMarkerDefinition[];
  categoryId?: TCategoryId;
  imageFileName?: string;
  confidence: AiExpenseDraftConfidence;
  warnings: string[];
  reviewReasons?: AiExpenseDraftReviewReason[];
  items?: ExtractedDraftItemInput<TCategoryId>[];
};

export type DraftActor<TGroupId extends string = string> = {
  userId: string;
  groupId: TGroupId;
};

/**
 * カテゴリが未指定なら検証不要、指定時はグループ所属を要求する。
 */
export function validateDraftCategoryOwnership(
  categoryId: string | undefined,
  category: { groupId: string } | null,
  groupId: string,
): { success: true } | { success: false; error: "not_in_group" } {
  if (categoryId === undefined) return { success: true };
  if (category === null || category.groupId !== groupId) {
    return { success: false, error: "not_in_group" };
  }
  return { success: true };
}

/**
 * 抽出結果を分類し、ユーザー上書きを適用した上で下書きの insert フィールドを構築する。
 * `aiValues` は receiptInterpretation として保持し、`values` を下書き本体へ反映する。
 */
export function buildExtractedDraftFields<TCategoryId extends string, TGroupId extends string>(
  actor: DraftActor<TGroupId>,
  args: ExtractedDraftInput<TCategoryId>,
  now: number,
) {
  const classification = classifyCreatedDraft(args as CreatedDraftClassificationInput);
  const aiValues: ReceiptDraftValueSnapshot<TCategoryId> = {
    status: classification.status,
    documentType: args.documentType,
    shopName: args.shopName,
    paymentPlace: args.paymentPlace,
    payeeName: args.payeeName,
    paymentPurpose: args.paymentPurpose,
    date: args.date,
    amountYen: args.amountYen,
    taxSummaries: args.taxSummaries,
    receiptTotalResolution: args.receiptTotalResolution,
    receiptTaxDecision: args.receiptTaxDecision,
    receiptLineClassifications: args.receiptLineClassifications,
    markerDefinitions: args.markerDefinitions,
    categoryId: args.categoryId,
    confidence: args.confidence,
    warnings: args.warnings,
    reviewReasons: classification.reviewReasons,
    items: args.items ?? [],
  };
  const values = applyReceiptUserOverride(aiValues, args.preservedUserOverride);

  return {
    values,
    draft: {
      groupId: actor.groupId,
      createdByUserId: actor.userId,
      sourceType: "image_upload" as const,
      status: values.status,
      documentType: values.documentType,
      imageFileName: args.imageFileName,
      shopName: values.shopName,
      paymentPlace: values.paymentPlace,
      payeeName: values.payeeName,
      paymentPurpose: values.paymentPurpose,
      date: values.date,
      amountYen: values.amountYen,
      taxSummaries: values.taxSummaries,
      receiptTotalResolution: values.receiptTotalResolution,
      receiptTaxDecision: values.receiptTaxDecision,
      receiptDataContractVersion: 1 as const,
      markerDefinitions: values.markerDefinitions,
      categoryId: values.categoryId,
      confidence: values.confidence,
      warnings: values.warnings,
      reviewReasons: values.reviewReasons,
      rawObservation:
        args.rawObservationLines === undefined
          ? undefined
          : { source: "ai_ocr" as const, observedAt: now, lines: args.rawObservationLines },
      receiptInterpretation: { source: "ai" as const, interpretedAt: now, values: aiValues },
      receiptUserOverride: args.preservedUserOverride,
      createdAt: now,
      updatedAt: now,
    },
  };
}

/** 明細の insert フィールドを構築する。 */
export function buildExtractedDraftItemFields<
  TCategoryId extends string,
  TGroupId extends string,
  TDraftId extends string,
>(groupId: TGroupId, draftId: TDraftId, item: ExtractedDraftItemInput<TCategoryId>, now: number) {
  return {
    groupId,
    draftId,
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
    quantity: item.quantity,
    unitPriceYen: item.unitPriceYen,
    categoryName: item.categoryName,
    categoryId: item.categoryId,
    confidence: item.confidence,
    warnings: item.warnings,
    createdAt: now,
    updatedAt: now,
  };
}

/** 画像解析失敗時の下書き insert フィールドを構築する。 */
export function buildFailedDraftFields<TGroupId extends string>(
  actor: DraftActor<TGroupId>,
  args: { warning: string; imageFileName?: string },
  now: number,
) {
  return {
    groupId: actor.groupId,
    createdByUserId: actor.userId,
    sourceType: "image_upload" as const,
    status: "failed" as const,
    documentType: "unknown" as const,
    imageFileName: args.imageFileName,
    confidence: {},
    warnings: [args.warning],
    reviewReasons: ["parse_failed" as const],
    createdAt: now,
    updatedAt: now,
  };
}
