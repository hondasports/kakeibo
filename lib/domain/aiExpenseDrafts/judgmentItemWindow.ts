/**
 * 金額・税内訳の判定とレビュー送信の対象にする明細の件数。
 * 下書き確認画面とレビュー置き換えの判定窓はこの件数を共有する。
 * 保存経路が全明細を持つ場合は、理由・状態・一覧サマリを全明細から計算する。
 * 窓を広げる場合は確認画面の読み取り上限ごと見直す。
 */
export const DRAFT_JUDGMENT_ITEM_LIMIT = 100;

/**
 * 判定対象の明細窓（先頭 DRAFT_JUDGMENT_ITEM_LIMIT 件）を切り出す。
 * items は作成順の昇順（listByDraftAsc と同じ順序）で渡す。
 */
export function takeDraftJudgmentItems<T>(items: readonly T[]): T[] {
  return items.slice(0, DRAFT_JUDGMENT_ITEM_LIMIT);
}
