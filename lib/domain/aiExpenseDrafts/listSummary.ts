import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { takeDraftJudgmentItems } from "./judgmentItemWindow";
import { isAmountAndTaxResolved } from "./reviewJudgment";
import { summarizeItems } from "./reviewItems";
import type { AiExpenseDraftItem, DraftListSummary } from "./reviewTypes";

/**
 * 一覧用の保存サマリ（aiExpenseDrafts.listSummary）を、下書きの値と明細から組み立てる。
 * 判定は下書きの値（金額・税内訳・rawObservation・receiptInterpretation 等）と明細の
 * 両方に依存するため、判定結果が変わり得る全書き込み経路はこの関数だけで保存値を作る（SSoT）。
 * 明細は全件ではなく判定窓（先頭 DRAFT_JUDGMENT_ITEM_LIMIT 件）で切ってから使う。
 * 呼び出し側が窓を意識しなくても、確認画面と同じ入力になる。
 */
export function buildDraftListSummary(
  draft: AiExpenseDraftFields,
  items: AiExpenseDraftItemFields[],
): DraftListSummary {
  const judgmentItems = takeDraftJudgmentItems(items);
  const reviewItems: AiExpenseDraftItem[] = judgmentItems.map((item) => {
    const { id, ...rest } = item;
    return { ...rest, _id: id };
  });
  const judgmentDraft = { ...draft, items: reviewItems };
  const itemSummary = summarizeItems(draft, judgmentItems);
  return {
    amountAndTaxResolved: isAmountAndTaxResolved(judgmentDraft),
    ...(itemSummary === undefined ? {} : { itemSummary }),
  };
}
