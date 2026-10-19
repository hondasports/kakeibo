import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { isAmountAndTaxResolved } from "./reviewJudgment";
import { summarizeItems } from "./reviewItems";
import type { AiExpenseDraftItem, DraftListSummary } from "./reviewTypes";

/**
 * 一覧用の保存サマリ（aiExpenseDrafts.listSummary）を、下書きの値と明細から組み立てる。
 * 判定は下書きの値（金額・税内訳・rawObservation・receiptInterpretation 等）と明細の
 * 両方に依存するため、判定結果が変わり得る全書き込み経路はこの関数だけで保存値を作る（SSoT）。
 */
export function buildDraftListSummary(
  draft: AiExpenseDraftFields,
  items: AiExpenseDraftItemFields[],
): DraftListSummary {
  const reviewItems: AiExpenseDraftItem[] = items.map((item) => {
    const { id, ...rest } = item;
    return { ...rest, _id: id };
  });
  const judgmentDraft = { ...draft, items: reviewItems };
  const itemSummary = summarizeItems(draft, items);
  return {
    amountAndTaxResolved: isAmountAndTaxResolved(judgmentDraft),
    ...(itemSummary === undefined ? {} : { itemSummary }),
  };
}
