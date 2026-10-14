import type { AiExpenseDraftFields } from "./aiExpenseDraft";

type ReceiptTotalSource = "explicit_label" | "user_confirmed" | "ai_estimate";

/** 保存済み合計候補から現在の amountYen に一致する source を採用する。3値以外は ai_estimate。 */
export function resolveReceiptTotalSource(
  draft: Pick<AiExpenseDraftFields, "amountYen" | "receiptTotalResolution">,
): ReceiptTotalSource {
  const persisted = draft.receiptTotalResolution?.candidates.find(
    (candidate) => candidate.amountYen === draft.amountYen,
  )?.source;
  return persisted === "explicit_label" ||
    persisted === "user_confirmed" ||
    persisted === "ai_estimate"
    ? persisted
    : "ai_estimate";
}

/** 税サマリ由来・税計算由来の候補は再解釈の裏付けから除外する。 */
export function resolveReceiptTotalSupportingCandidates(
  draft: Pick<AiExpenseDraftFields, "receiptTotalResolution">,
) {
  return draft.receiptTotalResolution?.candidates.filter(
    (candidate) =>
      candidate.source !== "tax_summary_total" && candidate.source !== "tax_arithmetic",
  );
}
