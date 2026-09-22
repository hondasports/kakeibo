import type {
  AmountBasis,
  TaxResolutionSource,
  TaxSummaryConsistencyReason,
  TaxSummaryConsistencyStatus,
} from "../../../../lib/receiptTax/types";
import { formatYen } from "../../../utils/currency";

export const TAX_RESOLUTION_SOURCE_LABELS = {
  item_explicit: "レシート明細に税率表記があります",
  single_summary: "レシート小計と商品合計が一致しました",
  summary_reconciliation: "レシート小計との照合で判定しました",
  remaining_summary: "他の税率区分を除いた残額と一致しました",
  marker_reconciled: "レシート記号と小計が一致しました",
  paid_total_reconciliation: "お支払いと商品合計の差から外税として判定しました",
} satisfies Record<TaxResolutionSource, string>;

export const TAX_REVIEW_REASON_LABELS: Record<string, string> = {
  multiple_tax_summaries: "複数の税率があり、明細との対応を特定できませんでした",
  cannot_reconcile_item_amounts: "商品合計とレシート小計が一致しませんでした",
  unresolved_tax_rate: "税率を判定できませんでした",
  unresolved_amount_basis: "税込・税抜を判定できませんでした",
  taxable_amount_mismatch: "商品合計とレシート小計が一致しません",
  normalized_amount_mismatch: "お支払いと商品合計が一致しません",
};

export const AMOUNT_BASIS_LABELS = {
  tax_included: "税込",
  tax_excluded: "税抜",
  unknown: "不明",
} satisfies Record<AmountBasis, string>;

export const TAX_SUMMARY_CONFLICT_LABELS: Record<TaxSummaryConsistencyReason, string> = {
  included_mode_with_tax_excluded_basis:
    "内税として読み取りましたが、対象額は税抜として読み取られています",
  external_mode_with_tax_included_basis:
    "外税として読み取りましたが、対象額は税込として読み取られています",
  tax_summary_amount_mismatch: "税率別対象額・税額・支払合計の金額が一致しません",
  tax_included_amount_mismatch: "税込額と支払合計が一致しません",
  reconciled_to_included: "税込対象額として再解釈しました",
  reconciled_to_external: "税抜対象額として再解釈しました",
  mixed_tax_mode: "内税と外税が混在しています",
  unresolved_tax_summary: "税率別集計の読み取り内容を確認してください",
};

export const TAX_SUMMARY_STATUS_LABELS: Record<TaxSummaryConsistencyStatus, string> = {
  verified: "確認済み",
  ambiguous: "確認が必要",
  contradictory: "矛盾あり",
  coherent: "確認済み",
  reconcilable: "再解釈可能",
  conflicting: "確認が必要",
};

export function getReviewReasonLabel(reason: string): string {
  return TAX_REVIEW_REASON_LABELS[reason] ?? "分析結果に確認が必要な項目があります";
}

export function getTaxResolutionSourceLabel(source: TaxResolutionSource): string {
  return TAX_RESOLUTION_SOURCE_LABELS[source];
}

export function getAmountBasisLabel(amountBasis: AmountBasis): string {
  return AMOUNT_BASIS_LABELS[amountBasis];
}

export function getTaxSummaryConflictLabel(reason: TaxSummaryConsistencyReason): string {
  return TAX_SUMMARY_CONFLICT_LABELS[reason];
}

export function getTaxSummaryStatusLabel(status: TaxSummaryConsistencyStatus): string {
  return TAX_SUMMARY_STATUS_LABELS[status];
}

export function formatTaxRateLabel(taxRatePercent: 0 | 8 | 10 | null | undefined): string {
  if (taxRatePercent === null || taxRatePercent === undefined) {
    return "未設定";
  }
  return `${taxRatePercent}%`;
}

export function formatYenLabel(amountYen: number | undefined): string {
  if (amountYen === undefined) {
    return "—";
  }
  return formatYen(amountYen);
}
