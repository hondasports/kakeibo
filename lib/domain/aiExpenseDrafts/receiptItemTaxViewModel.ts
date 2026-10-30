import type {
  AmountBasis,
  ExtractedTaxSummary,
  TaxContextResolution,
  TaxResolutionSource,
} from "../receipt/tax/types";
import type { ReviewItemValues } from "./reviewTypes";
import { ITEM_IDENTITY_CHANGED } from "../receipt/tax/itemTaxConfirmation";
import {
  formatTaxRateLabel,
  formatYenLabel,
  getAmountBasisLabel,
  getReviewReasonLabel,
  getTaxResolutionSourceLabel,
} from "./receiptTaxLabels";

export type ReceiptItemTaxViewModel = {
  itemName: string;
  printedAmountLabel: string;
  normalizedAmountLabel: string;
  taxRateLabel: string;
  amountBasisLabel: string;
  allocatedTaxLabel: string;
  status: "resolved" | "unresolved";
  resolutionReasonLabel?: string;
  reviewReasonLabels: string[];
  markerLabels: string[];
  showAmountBasisSelect: boolean;
};

type TaxContextSourceItem = {
  taxResolutionStatus?: "resolved" | "unresolved";
  taxResolutionSource?: TaxResolutionSource;
  taxRatePercent?: 0 | 8 | 10 | null;
  amountBasis?: AmountBasis;
  taxReviewReasons?: string[];
};

function buildTaxContext(item: TaxContextSourceItem): TaxContextResolution {
  if (
    item.taxResolutionStatus === "resolved" &&
    item.taxResolutionSource &&
    item.taxRatePercent !== null &&
    item.taxRatePercent !== undefined &&
    item.amountBasis &&
    item.amountBasis !== "unknown"
  ) {
    return {
      status: "resolved",
      taxRatePercent: item.taxRatePercent,
      amountBasis: item.amountBasis,
      source: item.taxResolutionSource,
    };
  }
  return {
    status: "unresolved",
    taxRatePercent: item.taxRatePercent ?? null,
    amountBasis: item.amountBasis ?? "unknown",
    reasons: item.taxReviewReasons ?? [],
  };
}

export function buildTaxContextFromReviewItem(item: ReviewItemValues): TaxContextResolution {
  return buildTaxContext(item);
}

export function getReviewItemTaxConfirmation(item: ReviewItemValues) {
  const context = buildTaxContextFromReviewItem(item);
  const hasRate = item.taxRatePercent != null;
  const hasBasis = item.amountBasis === "tax_included" || item.amountBasis === "tax_excluded";
  if (context.status === "resolved") {
    return {
      statusLabel: item.taxAllocationStatus === "unallocated" ? "税額未確定" : undefined,
      message: undefined,
      canConfirm: false,
    };
  }
  const identityChanged = item.taxReviewReasons?.includes(ITEM_IDENTITY_CHANGED);
  const missing = [!hasRate && "税率", !hasBasis && "税込／税抜"].filter(Boolean).join("・");
  return {
    statusLabel: hasRate && hasBasis ? "確認待ち" : "未確定",
    message: missing
      ? `${missing}が未設定です。レシートと照合して選択してください。`
      : identityChanged
        ? "商品名・行の種類が変わっています。レシートと照合して税率を確認してください。"
        : "表示中の税率・税込／税抜はまだ確認されていません。レシートと照合して確認してください。",
    canConfirm: hasRate && hasBasis,
  };
}

export function toReceiptItemTaxViewModel(item: ReviewItemValues): ReceiptItemTaxViewModel {
  const context = buildTaxContextFromReviewItem(item);
  const printedAmountYen =
    item.printedAmountYen ??
    (Number.isFinite(Number(item.amountYen)) ? Number(item.amountYen) : undefined);
  const normalizedAmountYen =
    item.normalizedAmountYen ??
    (Number.isFinite(Number(item.amountYen)) ? Number(item.amountYen) : undefined);

  return {
    itemName: item.itemName,
    printedAmountLabel: formatYenLabel(printedAmountYen),
    normalizedAmountLabel:
      item.taxAllocationStatus === "allocated" ? formatYenLabel(normalizedAmountYen) : "未確定",
    taxRateLabel: formatTaxRateLabel(context.taxRatePercent),
    amountBasisLabel: getAmountBasisLabel(context.amountBasis),
    allocatedTaxLabel:
      item.taxAllocationStatus === "allocated" ? formatYenLabel(item.allocatedTaxYen) : "未確定",
    status: context.status,
    resolutionReasonLabel:
      context.status === "resolved" ? getTaxResolutionSourceLabel(context.source) : undefined,
    reviewReasonLabels:
      context.status === "unresolved" ? context.reasons.map(getReviewReasonLabel) : [],
    markerLabels: item.markers ?? (item.taxMarker ? [item.taxMarker] : []),
    showAmountBasisSelect: context.status === "unresolved" && context.amountBasis === "unknown",
  };
}

export function getTaxModeLabel(taxMode: ExtractedTaxSummary["taxMode"]): string {
  switch (taxMode) {
    case "external":
      return "外税";
    case "included":
      return "内税";
    case "mixed":
      return "混在";
    default:
      return "不明";
  }
}
