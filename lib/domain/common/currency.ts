export const currencyFormatter = new Intl.NumberFormat("ja-JP");

/**
 * 数値を日本円表記の文字列にフォーマットする。
 * 例: 1234 → "1,234円"
 */
export function formatYen(amount: number): string {
  return `${currencyFormatter.format(amount)}円`;
}

/**
 * 数値の絶対値を日本円表記にし、符号は呼び出し側で付与する。
 * 例: -1234 → "1,234円"
 */
export function formatYenAbs(amount: number): string {
  return `${currencyFormatter.format(Math.abs(amount))}円`;
}

/**
 * 0 に符号を付けないのは ±0 が増減を表さないため。
 * 負号は ASCII ハイフンではなく U+2212 のマイナス記号を使う。
 */
export function formatSignedYen(amount: number): string {
  if (amount === 0) {
    return formatYen(0);
  }
  return `${amount < 0 ? "−" : "+"}${formatYenAbs(amount)}`;
}

/**
 * 1 万円以上の場合は "1.2万円" のように圧縮して表記する。
 * 1 万円未満は "1,234円" の通常表記を返す。
 */
export function formatYenCompact(amount: number): string {
  if (Math.abs(amount) >= 10_000) {
    const amountInTenThousands = Number((amount / 10_000).toFixed(1));
    return `${amountInTenThousands}万円`;
  }
  return formatYen(amount);
}

/**
 * グラフの軸の目盛りを、軸全体の単位をそろえて表記する。
 * 軸の最大値が 1 万円以上なら全目盛りを万円で表す（"0万円"・"0.5万円"・"1.2万円"）。
 * 1 万円未満なら全目盛りを円で表す。目盛りごとに単位を切り替えると、
 * 同じ軸に "4,000円" と "1.2万円" が混ざって読み取りにくくなるため、判定は目盛り単位ではなく軸全体で行う。
 */
export function formatYenAxisTick(amount: number, axisMaxYen: number): string {
  if (Math.abs(axisMaxYen) < 10_000) {
    return formatYen(amount);
  }
  const amountInTenThousands = Number((amount / 10_000).toFixed(1));
  return `${amountInTenThousands}万円`;
}
