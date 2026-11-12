import type { AiExpenseDraftFields } from "./aiExpenseDraft";
import type { AiExpenseDraftItemFields } from "./aiExpenseDraftItem";
import { takeDraftJudgmentItems } from "./judgmentItemWindow";
import { judgeDraftAmountAndTax } from "./draftAmountTaxJudgment";
import { summarizeItems } from "./reviewItems";
import type { AiExpenseDraftItem, DraftListSummary } from "./reviewTypes";

/**
 * 一覧用の保存サマリ（aiExpenseDrafts.listSummary）を、下書きの値と明細から組み立てる。
 * 判定は下書きの値（金額・税内訳・rawObservation・receiptInterpretation 等）と明細の
 * 両方に依存するため、判定結果が変わり得る全書き込み経路はこの関数だけで保存値を作る（SSoT）。
 * 既定では確認画面と同じ判定窓を使用し、全明細を持つ保存経路は全件を指定する。
 */
export function buildDraftListSummary(
  draft: AiExpenseDraftFields,
  items: AiExpenseDraftItemFields[],
  amountAndTaxResolved?: boolean,
  itemScope: "judgment_window" | "all_items" = "judgment_window",
): DraftListSummary {
  const judgmentItems = itemScope === "all_items" ? items : takeDraftJudgmentItems(items);
  const reviewItems: AiExpenseDraftItem[] = judgmentItems.map((item) => {
    const { id, ...rest } = item;
    return { ...rest, _id: id };
  });
  const judgmentDraft = { ...draft, items: reviewItems };
  const itemSummary = summarizeItems(draft, judgmentItems);
  return {
    amountAndTaxResolved:
      amountAndTaxResolved ??
      judgeDraftAmountAndTax(judgmentDraft, { itemScope }).status === "resolved",
    ...(itemSummary === undefined ? {} : { itemSummary }),
  };
}
