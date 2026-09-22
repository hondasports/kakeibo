import type { ProductUpdateDraft } from "../../lib/domain/productUpdates";

// 2026-09-05 以降に本番へ反映されたが、旧自動生成の不具合で掲載されなかった分の回収。
// 詳細: https://github.com/hondasports/kakeibo/issues/741
export const productUpdateDrafts: ProductUpdateDraft[] = [
  {
    id: "pr-726",
    title: "レシート読み取り補助の重複明細と購入日付を修正",
    summary:
      "レシート読み取りで同一金額の明細が重複して下書きされる問題を修正し、紙のレシートの購入日付が正しく反映されるようにしました。",
    category: "fix",
  },
  {
    id: "pr-735",
    title: "下書き確認を商品ごとの修正・保存まで一つの画面に統合",
    summary:
      "抽出下書きの確認・修正・保存の導線を一つの画面にまとめ、明細の入力不備や空欄ラベルを分かりやすく案内するようにしました。",
    category: "improvement",
  },
  {
    id: "pr-739",
    title: "下書きの確認推奨対象と税設定の用途を明確化",
    summary: "下書きで確認を推奨する対象と、税込・税率設定の用途の説明を明確にしました。",
    category: "improvement",
  },
  {
    id: "pr-749",
    title: "下書きの未配分税額を未確定として表示",
    summary:
      "税額を明細へ配分しきれない場合に未確定と表示するようにし、税内訳と割引の確認導線を改善しました。",
    category: "fix",
  },
  {
    id: "pr-836",
    title: "下書き保存時にレシート明細の税額・税込登録額を再計算する",
    summary:
      "レシート下書きの「金額確認」「税率別集計」が一致していても登録額（税込）が未確定のまま残り、支出登録に失敗する不具合を修正しました。「下書きを保存」で全明細の税額・税込登録額が再計算され、保存した下書きをそのまま支出として登録できるようになります。",
    category: "fix",
  },
];
