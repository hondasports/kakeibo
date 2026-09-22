/** この行数以上になる表示は「もっと見る / 閉じる」を出す */
export const MEMO_COLLAPSE_LINE_THRESHOLD = 3;

/** 折りたたみ時に見せる最大行数（3行以上必要なときだけトグル） */
export const MEMO_COLLAPSED_MAX_LINES = 2;

/** メモ内の改行数から表示行数を数える（`\n` 区切り。文字列切り詰めは行わない） */
export function countExplicitMemoLines(memo: string): number {
  if (memo.length === 0) {
    return 0;
  }
  return memo.split("\n").length;
}

/** 改行だけで3行以上になるメモは折りたたみ対象 */
export function memoNeedsCollapseByLineCount(memo: string): boolean {
  return countExplicitMemoLines(memo) >= MEMO_COLLAPSE_LINE_THRESHOLD;
}

/** 折り返し込みの描画行数が3行以上なら折りたたみ対象（DOM 計測） */
export function memoNeedsCollapseByLayout(scrollHeight: number, lineHeight: number): boolean {
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
    return false;
  }
  const renderedLineCount = Math.ceil(scrollHeight / lineHeight - 1e-3);
  return renderedLineCount >= MEMO_COLLAPSE_LINE_THRESHOLD;
}

/** 折りたたみ時の `-webkit-line-clamp` 用 sx */
export function getMemoLineClampSx(maxLines: number) {
  return {
    display: "-webkit-box",
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  };
}
