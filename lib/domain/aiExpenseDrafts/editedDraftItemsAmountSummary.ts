import type { ReceiptItemLineType } from "../receipt/discountItems";
import type { AmountBasis } from "../receipt/tax/types";
import { mapDraftItemsToReviewItems } from "./reviewDraftMapping";
import { judgeReviewFormAmountAndTax } from "./reviewFormJudgment";
import type { ReviewAmountCheck } from "./reviewAmountChecks";
import type {
  AiExpenseDraftJudgmentInput,
  AiExpenseDraftItem,
  ReviewItemValues,
} from "./reviewTypes";

/** 履歴の編集ダイアログで編集中の明細。入力値は文字列のまま受ける。 */
export type EditedDraftItem = {
  itemId?: string;
  itemName: string;
  lineType?: ReceiptItemLineType;
  amountYen: string;
  categoryId: string;
};

export type EditedDraftItemsAmountSummary = {
  /** 下書きの確認画面と同じ金額確認の結果。 */
  amount: ReviewAmountCheck;
  /** 明細の金額が税込か税抜か。揃っていなければ mixed、決まらない明細があれば unknown。 */
  amountBasis: AmountBasis | "mixed";
};

function summarizeAmountBasis(items: readonly ReviewItemValues[]): AmountBasis | "mixed" {
  const bases = new Set(items.map((item) => item.amountBasis ?? "unknown"));
  if (bases.has("unknown")) return "unknown";
  return bases.size === 1 ? [...bases][0] : "mixed";
}

/**
 * 登録済み下書きの編集中の入力から、明細合計と金額の関係を判定する。
 * 税の判定・配分は確認画面と同じ judgeReviewFormAmountAndTax に任せ、ここでは入力を渡すだけにする。
 */
export function summarizeEditedDraftItemsAmount(args: {
  draft: AiExpenseDraftJudgmentInput;
  /** 保存済みの明細。編集中の明細の itemId で引き、税の設定を引き継ぐ。 */
  savedItems: readonly AiExpenseDraftItem[];
  amountYen: string;
  categoryId: string;
  items: readonly EditedDraftItem[];
}): EditedDraftItemsAmountSummary | null {
  if (args.items.length === 0) return null;
  const saved = new Map(
    mapDraftItemsToReviewItems([...args.savedItems]).map((item) => [item.persistedItemId, item]),
  );
  const reviewItems = args.items.map((item, index): ReviewItemValues => {
    const base = item.itemId === undefined ? undefined : saved.get(item.itemId);
    return {
      ...base,
      id: base?.id ?? `new-${index}`,
      itemName: item.itemName,
      lineType: item.lineType,
      amountYen: item.amountYen,
      categoryId: item.categoryId,
    };
  });
  const { checks } = judgeReviewFormAmountAndTax(
    { ...args.draft, items: [...args.savedItems] },
    {
      documentType: args.draft.documentType,
      shopName: args.draft.shopName ?? "",
      date: args.draft.date ?? "",
      amountYen: args.amountYen,
      categoryId: args.categoryId,
      registrationMode: "detailed",
    },
    reviewItems,
  );
  return { amount: checks.amount, amountBasis: summarizeAmountBasis(reviewItems) };
}
