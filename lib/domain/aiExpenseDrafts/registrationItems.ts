/**
 * 下書き → 支出エントリ/レシート登録用の明細構築に関するドメイン知識。
 * totalOnly 時の合計確認・税解釈の確定状態の検証を行う。
 * 失敗時は Error を投げる（ユースケース層で ConvexError へ変換する）。
 */
import { reinterpretDraftTax } from "../receipt/tax/reinterpretDraftTax";
import { mapDraftItemToTaxFields } from "../receipt/tax/draftTaxMapping";
import type { ExtractedTaxSummary, ReceiptMarkerDefinition } from "../receipt/tax/types";
import type { AiExpenseRegistrationMode } from "./receiptDataContract";
import { resolveReceiptShopNameFromDraft } from "./shopName";
import { aggregateDraftItemsByCategory, getDraftItemAggregationErrorMessage } from "./reviewItems";
import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";

/** 登録用の明細（カテゴリ集約済み）。 */
export type DraftRegistrationItem = {
  itemName: string;
  amountYen: number;
  categoryId: string;
};

/** 登録可否判定に必要な下書きの形状。 */
export type DraftForRegistration = Pick<
  AiExpenseDraftFields,
  | "registrationMode"
  | "receiptTotalResolution"
  | "amountYen"
  | "taxSummaries"
  | "markerDefinitions"
  | "categoryId"
  | "documentType"
  | "shopName"
  | "paymentPlace"
  | "payeeName"
  | "paymentPurpose"
>;

/** 登録可否判定に必要な明細の形状。 */
export type DraftItemForRegistration = AiExpenseDraftItemFields;

/** 登録モードを解決する。未設定の既存下書きは detailed として扱う。 */
export function resolveRegistrationMode(draft: {
  registrationMode?: AiExpenseRegistrationMode;
}): AiExpenseRegistrationMode {
  return draft.registrationMode ?? "detailed";
}

function assertUserConfirmedReceiptTotal(draft: DraftForRegistration): void {
  const resolution = draft.receiptTotalResolution;
  const hasMatchingUserCandidate = resolution?.candidates.some(
    (candidate) => candidate.source === "user_confirmed" && candidate.amountYen === draft.amountYen,
  );
  if (
    resolution?.status !== "verified" ||
    resolution.protectedAmountYen !== draft.amountYen ||
    !hasMatchingUserCandidate
  ) {
    throw new Error("Receipt total must be confirmed before total-only registration");
  }
}

/**
 * 下書きと明細から登録用のカテゴリ集約済み明細を構築する。
 * totalOnly の場合はユーザー確認済み合計を検証し、税内訳がある場合は全明細の
 * 税割当が確定していることを検証する。失敗時は Error を投げる。
 */
export function buildDraftRegistrationItems(
  draft: DraftForRegistration,
  items: DraftItemForRegistration[],
): DraftRegistrationItem[] {
  const mode = resolveRegistrationMode(draft);
  if (mode === "totalOnly") {
    assertUserConfirmedReceiptTotal(draft);
    return [
      {
        itemName: resolveReceiptShopNameFromDraft(draft),
        amountYen: draft.amountYen!,
        categoryId: draft.categoryId!,
      },
    ];
  }
  if (draft.taxSummaries?.length || items.some((item) => item.taxRatePercent != null)) {
    const { itemFields, interpretation } = reinterpretDraftTax({
      amountYen: draft.amountYen!,
      items: items.map(mapDraftItemToTaxFields),
      taxSummaries: (draft.taxSummaries ?? []) as ExtractedTaxSummary[],
      markerDefinitions: draft.markerDefinitions as ReceiptMarkerDefinition[] | undefined,
    });
    if (
      interpretation.taxSummaries.some((summary) => summary.status !== "verified") ||
      itemFields.some(
        (item, index) =>
          item.taxAllocationStatus !== "allocated" ||
          item.normalizedAmountYen !== (items[index].normalizedAmountYen ?? items[index].amountYen),
      ) ||
      itemFields.reduce((sum, item) => sum + item.normalizedAmountYen, 0) !== draft.amountYen
    ) {
      throw new Error(
        "税額または税込登録額が未確定です。税内訳と明細を確認して下書きを保存してください。",
      );
    }
  }
  const result = aggregateDraftItemsByCategory(
    {
      amountYen: draft.amountYen!,
      categoryId: draft.categoryId!,
      documentType: draft.documentType,
      shopName: draft.shopName,
      paymentPlace: draft.paymentPlace,
      payeeName: draft.payeeName,
      paymentPurpose: draft.paymentPurpose,
    },
    items,
  );
  if (!result.success) {
    throw new Error(getDraftItemAggregationErrorMessage(result.error));
  }
  return result.items;
}
