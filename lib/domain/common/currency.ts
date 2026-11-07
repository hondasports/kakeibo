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
