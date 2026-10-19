/**
 * 金額・税内訳の判定とレビュー送信の対象にする明細の件数。
 * 下書き確認画面・一覧・保存サマリ・レビュー置き換えはすべてこの窓を共有する（SSoT）。
 * 101件目以降の明細は保存されるが判定対象には含めない。確認画面が先頭この件数しか
 * 読まないため、全明細で判定すると一覧と確認画面の結果がずれる（#997/#1062）。
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
